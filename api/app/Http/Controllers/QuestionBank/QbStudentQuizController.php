<?php

namespace App\Http\Controllers\QuestionBank;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{QbQuiz, QbQuizAttempt, QbQuizPackage, QbStudentPackageAccess};
use App\Services\Billing\BkashService;
use App\Services\QbQuizService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// QB.10 (D66, docs/modules/question-bank.md §3ছ, §5): the student's quizzes on the institution's host. Free and public quizzes for
// every student; a package's quizzes only while the student's access lasts (expired: closed, past results still readable). A
// package is bought with bKash through QB.9's order flow (the server prices it from the student list). An attempt: start (the
// questions without answers, a deadline), save answers as you go, submit - marked on the server; past the deadline the server
// takes what was saved (here, and qb:close-quiz-attempts for attempts nobody comes back to).
class QbStudentQuizController extends Controller
{
    public function __construct(private QbQuizService $quizzes) {}

    /** GET /student/qb/quizzes: the quizzes this student can see, each with may_take and the last attempt */
    public function index(Request $request)
    {
        $user = $request->user();
        $this->closeMine($user->id);
        $access = QbStudentPackageAccess::where('student_user_id', $user->id)->get()->groupBy('qb_quiz_package_id')
            ->map(fn ($rows) => $rows->max('expires_at'));
        $last = QbQuizAttempt::where('student_user_id', $user->id)->orderByDesc('id')->get()->unique('qb_quiz_id')->keyBy('qb_quiz_id');
        $rows = QbQuiz::where('is_active', true)->orderBy('access')->orderByDesc('id')->limit(500)->get()
            ->filter(fn ($q) => $q->access !== 'package' || $access->has($q->qb_quiz_package_id) || $last->has($q->id))
            ->map(fn ($q) => $q->only(['id', 'title', 'access', 'qb_quiz_package_id', 'qb_subject_id', 'duration_minutes', 'question_count', 'pass_mark']) + [
                'opens_at' => $q->opens_at?->toIso8601String(), 'closes_at' => $q->closes_at?->toIso8601String(),
                'access_expires_at' => $q->qb_quiz_package_id && $access->has($q->qb_quiz_package_id) ? \Illuminate\Support\Carbon::parse($access[$q->qb_quiz_package_id])->toIso8601String() : null,
                'may_take' => $this->quizzes->open($q) && $this->quizzes->mayTake($user, $q),
                'last_attempt' => $last->has($q->id) ? $last[$q->id]->only(['id', 'score', 'total']) + ['submitted' => (bool) $last[$q->id]->submitted_at] : null,
            ])->values();
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** GET /student/qb/quiz-packages: active packages with the student price and this student's access */
    public function packages(Request $request, QbStudentController $prices)
    {
        $user = $request->user();
        $counts = QbQuiz::where('is_active', true)->whereNotNull('qb_quiz_package_id')->selectRaw('qb_quiz_package_id, count(*) n')->groupBy('qb_quiz_package_id')->pluck('n', 'qb_quiz_package_id');
        $rows = QbQuizPackage::where('is_active', true)->orderByDesc('id')->limit(200)->get()->map(function ($p) use ($user, $prices, $counts) {
            $until = QbStudentPackageAccess::where('student_user_id', $user->id)->where('qb_quiz_package_id', $p->id)->where('expires_at', '>', now())->max('expires_at');
            return $p->only(['id', 'title', 'description', 'qb_class_level_id', 'qb_subject_id', 'validity_days']) + ['quiz_count' => (int) ($counts[$p->id] ?? 0),
                'price' => $prices->quote($user, 'quiz_package', $p)['price'], 'access_until' => $until ? \Illuminate\Support\Carbon::parse($until)->toIso8601String() : null];
        });
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** POST /student/qb/quiz-packages/{id}/buy: free = access now; otherwise one bKash payment (renewal adds to a running access) */
    public function buy(Request $request, int $id, BkashService $bkash, QbStudentController $orders)
    {
        $request->validate(['amount' => 'prohibited', 'price' => 'prohibited']);
        $package = QbQuizPackage::where('is_active', true)->findOrFail($id);
        $q = $orders->quote($request->user(), 'quiz_package', $package);
        if ($q['price'] === null) throw new BusinessException('this package has no price yet', 'qb_not_for_sale', 422);
        $item = ['item_type' => 'quiz_package', 'item_id' => $package->id, 'price' => $q['price'],
            'reason' => Money::toPaisa($q['price']) === 0 ? 'free' : ($q['rule_id'] !== null ? 'partial_free' : 'paid')];
        if ($item['reason'] === 'free') {
            QbStudentController::unlock($request->user(), $item, null);
            return $orders->pay($request, $bkash, [], 1, '/student/quizzes');
        }
        return $orders->pay($request, $bkash, [$item], 0, '/student/quizzes');
    }

    /** POST /student/qb/quizzes/{id}/attempts: starts one (or resumes the unsubmitted one still in time) */
    public function start(Request $request, int $id)
    {
        $user = $request->user();
        $quiz = QbQuiz::findOrFail($id);
        if (!$this->quizzes->open($quiz)) throw $this->quizzes->notOpen();
        if (!$this->quizzes->mayTake($user, $quiz)) {
            throw new BusinessException('no access to this quiz', $quiz->qb_quiz_package_id && QbStudentPackageAccess::where('student_user_id', $user->id)
                ->where('qb_quiz_package_id', $quiz->qb_quiz_package_id)->exists() ? 'qb_package_expired' : 'qb_package_needed', 403);
        }
        $this->closeMine($user->id);
        $attempt = DB::transaction(function () use ($user, $quiz) {
            $running = QbQuizAttempt::where('student_user_id', $user->id)->where('qb_quiz_id', $quiz->id)->whereNull('submitted_at')->lockForUpdate()->first();
            if ($running) return $running;
            $ids = $this->quizzes->draw($quiz);
            if ($ids === []) throw new BusinessException('this quiz has no questions yet', 'qb_quiz_empty', 422);
            return QbQuizAttempt::create(['student_user_id' => $user->id, 'qb_quiz_id' => $quiz->id, 'started_at' => now(), 'answers' => ['q' => $ids, 'given' => []]]);
        });
        return response()->json(['success' => true, 'data' => $this->quizzes->result($attempt->fresh(), $quiz)], 201);
    }

    /** GET /student/qb/attempts: this student's attempts (results stay readable after a package expires) */
    public function attempts(Request $request)
    {
        $uid = $request->user()->id;
        $this->closeMine($uid);
        $titles = QbQuiz::pluck('title', 'id');
        $rows = QbQuizAttempt::where('student_user_id', $uid)->orderByDesc('id')->limit(200)->get()
            ->map(fn ($a) => $a->only(['id', 'qb_quiz_id', 'score', 'total']) + ['title' => $titles[$a->qb_quiz_id] ?? null,
                'started_at' => $a->started_at?->toIso8601String(), 'submitted_at' => $a->submitted_at?->toIso8601String()]);
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** GET /student/qb/attempts/{id}: running = the questions and the deadline; submitted = the result with right answers */
    public function attempt(Request $request, int $id)
    {
        $a = $this->mine($request, $id);
        $this->quizzes->closeOverdue(collect([$a]));
        return response()->json(['success' => true, 'data' => $this->quizzes->result($a->fresh(), QbQuiz::findOrFail($a->qb_quiz_id))]);
    }

    /** PUT /student/qb/attempts/{id} {answers}: keeps the answers so far (refused after the deadline) */
    public function save(Request $request, int $id)
    {
        $f = $request->validate(['answers' => 'present|array|max:200']);
        $a = $this->mine($request, $id);
        $quiz = QbQuiz::findOrFail($a->qb_quiz_id);
        if ($a->submitted_at || now() > $this->quizzes->deadline($a, $quiz)->addSeconds(QbQuizService::GRACE_SECONDS)) {
            $this->quizzes->submit($a);
            throw new BusinessException('the time is over', 'qb_quiz_time_over', 422);
        }
        DB::transaction(function () use ($a, $f) {
            $row = QbQuizAttempt::whereKey($a->id)->lockForUpdate()->first();
            if ($row->submitted_at) return;
            $data = $row->answers ?? [];
            $row->update(['answers' => ['given' => $this->quizzes->clean($f['answers'], $data['q'] ?? [])] + $data]);
        });
        return response()->json(['success' => true, 'data' => ['saved' => true]]);
    }

    /** POST /student/qb/attempts/{id}/submit {answers}: marked on the server; late answers are ignored */
    public function submit(Request $request, int $id)
    {
        $f = $request->validate(['answers' => 'present|array|max:200', 'score' => 'prohibited', 'total' => 'prohibited']);
        $a = $this->quizzes->submit($this->mine($request, $id), $f['answers']);
        return response()->json(['success' => true, 'data' => $this->quizzes->result($a, QbQuiz::findOrFail($a->qb_quiz_id))]);
    }

    private function mine(Request $request, int $id): QbQuizAttempt
    {
        return QbQuizAttempt::where('student_user_id', $request->user()->id)->findOrFail($id);
    }

    private function closeMine(int $uid): void
    {
        $this->quizzes->closeOverdue(QbQuizAttempt::where('student_user_id', $uid)->whereNull('submitted_at')->limit(50)->get());
    }
}
