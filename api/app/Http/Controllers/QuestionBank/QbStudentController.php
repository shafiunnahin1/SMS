<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Resources\{QbContentPublicResource, QbQuestionPublicResource};
use App\Models\{PlatformSetting, Program, QbConcept, QbQuestion, QbQuizPackage, QbStudentOrder, QbStudentPackageAccess, QbStudentUnlock, Student, User};
use App\Services\Billing\BkashService;
use App\Services\{QbEarningService, QbPricingService};
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, DB};
use Illuminate\Support\Str;

// QB.9 (D65/D66, docs/modules/question-bank.md §1, §4.1, §4.2, §5): the student portal on the institution's host. Questions are free
// to read; an answer or a concept is bought by the STUDENT (their own unlock - another student never gets it, nor does the
// institution's purchase count) with bKash to the platform merchant (D58 BkashService). The server prices every item from the
// student price list and stores the order with its items and amount; the central callback (QbStudentOrderCallbackController)
// trusts only that record. A free item opens at once without a payment.
class QbStudentController extends Controller
{
    public const TYPES = ['question' => QbQuestion::class, 'concept' => QbConcept::class];

    public function __construct(private QbPricingService $pricing) {}

    /** GET /student/qb/curriculum: the tree, and the student's own platform class (their program's link) */
    public function curriculum(Request $request)
    {
        return response()->json(['success' => true, 'data' => QbCurriculumController::treeData() + ['my_class_level_id' => $this->myClass($request->user())]]);
    }

    /** GET /student/qb/questions?qb_subject_id=&qb_chapter_id=&qb_topic_id=&q=&page= */
    public function questions(Request $request)
    {
        $f = $request->validate(['qb_subject_id' => 'nullable|integer', 'qb_chapter_id' => 'nullable|integer', 'qb_topic_id' => 'nullable|integer',
            'q' => 'nullable|string|max:100', 'per_page' => 'nullable|integer|min:1|max:50']);
        $page = QbQuestion::query()
            ->when($f['qb_subject_id'] ?? null, fn ($q, $v) => $q->where('qb_subject_id', $v))
            ->when($f['qb_chapter_id'] ?? null, fn ($q, $v) => $q->where('qb_chapter_id', $v))
            ->when($f['qb_topic_id'] ?? null, fn ($q, $v) => $q->where('qb_topic_id', $v))
            ->when($f['q'] ?? null, fn ($q, $s) => $q->where('question_text', 'like', '%' . addcslashes($s, '%_\\') . '%'))
            ->orderByDesc('published_at')->orderByDesc('id')->paginate($f['per_page'] ?? 20);
        $open = $this->owned($request->user(), 'question', collect($page->items())->pluck('id')->all());
        return response()->json(['success' => true,
            'data' => collect($page->items())->map(fn ($q) => QbQuestionPublicResource::make($q, in_array($q->id, $open, true)))->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()]]);
    }

    /** GET /student/qb/questions/{id}: the answer only once this student owns it; otherwise the student price */
    public function question(Request $request, int $id)
    {
        $q = QbQuestion::findOrFail($id);
        $open = $this->owned($request->user(), 'question', [$q->id]) !== [];
        return response()->json(['success' => true, 'data' => QbQuestionPublicResource::make($q, $open) + ['price' => $open ? null : $this->quote($request->user(), 'question', $q)['price']]]);
    }

    /** GET /student/qb/concepts?qb_topic_id= */
    public function concepts(Request $request)
    {
        $f = $request->validate(['qb_topic_id' => 'required|integer']);
        $rows = QbConcept::where('qb_topic_id', $f['qb_topic_id'])->orderBy('sort_order')->orderBy('id')->limit(500)->get();
        $open = $this->owned($request->user(), 'concept', $rows->pluck('id')->all());
        return response()->json(['success' => true, 'data' => $rows->map(fn ($c) => QbContentPublicResource::concept($c, in_array($c->id, $open, true), full: false))->values()]);
    }

    /** GET /student/qb/concepts/{id} */
    public function concept(Request $request, int $id)
    {
        $c = QbConcept::findOrFail($id);
        $open = $this->owned($request->user(), 'concept', [$c->id]) !== [];
        return response()->json(['success' => true, 'data' => QbContentPublicResource::concept($c, $open) + ['price' => $open ? null : $this->quote($request->user(), 'concept', $c)['price']]]);
    }

    /** POST /student/qb/orders {items: [{item_type, item_id}]}: free items open now; the rest become one bKash payment */
    public function order(Request $request, BkashService $bkash)
    {
        $f = $request->validate(['items' => 'required|array|min:1|max:20', 'items.*.item_type' => 'required|in:question,concept', 'items.*.item_id' => 'required|integer',
            'amount' => 'prohibited', 'price' => 'prohibited']);
        $user = $request->user();
        $priced = [];
        foreach ($f['items'] as $it) {
            $item = (self::TYPES[$it['item_type']])::findOrFail($it['item_id']);                 // the catalogue scope: published only
            if ($this->owned($user, $it['item_type'], [$item->id]) !== []) continue;
            $q = $this->quote($user, $it['item_type'], $item);
            if ($q['price'] === null) throw new BusinessException('this item has no price yet', 'qb_not_for_sale', 422);
            $priced["{$it['item_type']}:{$item->id}"] = ['item_type' => $it['item_type'], 'item_id' => $item->id, 'price' => $q['price'],
                'reason' => Money::toPaisa($q['price']) === 0 ? 'free' : ($q['rule_id'] !== null ? 'partial_free' : 'paid')];
        }
        $free = array_filter($priced, fn ($p) => $p['reason'] === 'free');
        $paid = array_values(array_filter($priced, fn ($p) => $p['reason'] !== 'free'));
        foreach ($free as $p) self::unlock($user, $p, null);
        return $this->pay($request, $bkash, $paid, count($free));
    }

    /** One bKash payment for the paid items (prices set by the server); nothing paid = done. Shared with QB.10's package purchase. */
    public function pay(Request $request, BkashService $bkash, array $paid, int $opened, string $page = '/student/question-bank')
    {
        $user = $request->user();
        if (!$paid) return response()->json(['success' => true, 'data' => ['paid' => true, 'opened' => $opened]]);

        if (!$bkash->configured()) throw new BusinessException('bKash is not configured', 'payment_unavailable', 503);
        $amount = Money::format(array_sum(array_map(fn ($p) => Money::toPaisa($p['price']), $paid)));
        $institution = Tenancy::current();
        $ref = 'QB' . $institution->id . 'S' . strtoupper(Str::random(8));                       // <= 20 chars, [A-Z0-9]
        $base = PlatformSetting::read('bkash_callback_base') ?: config('app.url');
        $payment = $bkash->createPayment($amount, $ref, rtrim((string) $base, '/') . '/api/v1/qb/student-orders/bkash/callback?ref=' . $ref);
        if (!$payment) return response()->json(['success' => false, 'error' => 'payment_failed', 'message' => __('errors.recharge_failed')
            . (config('app.debug') && $bkash->lastError() ? ' (' . $bkash->lastError() . ')' : '')], 502);
        $order = QbStudentOrder::create(['student_user_id' => $user->id, 'ref' => $ref, 'items' => $paid, 'amount' => $amount, 'payment_id' => $payment['paymentID'], 'status' => 'pending']);
        $back = $request->headers->get('origin');
        Cache::put("qb_student_order:{$ref}", ['institution_id' => $institution->id, 'order_id' => $order->id, 'page' => $page,
            'return' => ($back && parse_url($back, PHP_URL_HOST) === $request->getHost()) ? $back : $request->getSchemeAndHttpHost()], now()->addDay());
        return response()->json(['success' => true, 'data' => ['paid' => false, 'opened' => $opened, 'bkash_url' => $payment['bkashURL'], 'ref' => $ref, 'amount' => $amount]]);
    }

    /** GET /student/qb/orders/{ref}: the student's own order */
    public function orderStatus(Request $request, string $ref)
    {
        $o = QbStudentOrder::where('ref', $ref)->where('student_user_id', $request->user()->id)->firstOrFail();
        return response()->json(['success' => true, 'data' => $o->only(['ref', 'amount', 'status', 'items'])]);
    }

    /** One student unlock (UNIQUE per student and item: a second one is ignored). A quiz package (QB.10) grants access for its
     *  validity_days from now - or from the end of an access still running, so a renewal never loses days. */
    public static function unlock(User $user, array $p, ?int $orderId): void
    {
        if ($p['item_type'] === 'quiz_package') {
            DB::transaction(function () use ($user, $p, $orderId) {
                if ($orderId && QbStudentPackageAccess::where('qb_student_order_id', $orderId)->where('qb_quiz_package_id', $p['item_id'])->lockForUpdate()->exists()) return;
                $package = QbQuizPackage::findOrFail($p['item_id']);
                $running = QbStudentPackageAccess::where('student_user_id', $user->id)->where('qb_quiz_package_id', $package->id)->where('expires_at', '>', now())->max('expires_at');
                $from = $running ? \Illuminate\Support\Carbon::parse($running) : now();
                $access = QbStudentPackageAccess::create(['student_user_id' => $user->id, 'qb_quiz_package_id' => $package->id, 'starts_at' => now(),
                    'expires_at' => $from->copy()->addDays($package->validity_days), 'qb_student_order_id' => $orderId]);
                app(QbEarningService::class)->credit('quiz_package', $access->id, 'quiz_package', $package->id, (string) $p['price']);   // QB.10b
            });
            return;
        }
        DB::transaction(function () use ($user, $p, $orderId) {
            if (QbStudentUnlock::where('student_user_id', $user->id)->where('item_type', $p['item_type'])->where('item_id', $p['item_id'])->lockForUpdate()->exists()) return;
            $unlock = QbStudentUnlock::create(['student_user_id' => $user->id, 'item_type' => $p['item_type'], 'item_id' => $p['item_id'], 'price' => $p['price'],
                'reason' => $p['reason'], 'qb_student_order_id' => $orderId]);
            app(QbEarningService::class)->credit('student_unlock', $unlock->id, $p['item_type'], (int) $p['item_id'], (string) $p['price']);   // QB.10b
        });
    }

    private function owned(User $user, string $type, array $ids): array
    {
        return $ids ? QbStudentUnlock::where('student_user_id', $user->id)->where('item_type', $type)->whereIn('item_id', $ids)->pluck('item_id')->map(fn ($v) => (int) $v)->all() : [];
    }

    public function quote(User $user, string $type, $item): array
    {
        $class = $this->myClass($user);
        return $this->pricing->quote('student', $type, $item, ['class_level_ids' => $class ? [$class] : []]);
    }

    /** The platform class of the student's program (programs.qb_class_level_id), or null */
    private function myClass(User $user): ?int
    {
        $programId = Student::where('user_id', $user->id)->value('program_id');
        return $programId ? Program::whereKey($programId)->value('qb_class_level_id') : null;
    }
}
