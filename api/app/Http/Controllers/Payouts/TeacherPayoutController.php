<?php

namespace App\Http\Controllers\Payouts;

use App\Http\Controllers\Controller;
use App\Models\TeacherPayout;
use App\Services\Payouts\TeacherPayoutService;
use Illuminate\Http\Request;

// D223 TPO.1 (coaching-private-batch.md "Teacher Payouts"): admin and accountant only - pay data (D33), never students, parents
// or other teachers. Amounts are computed by the server; the client only names the month, an edited draft amount with its note,
// and how / when a payout was paid.
class TeacherPayoutController extends Controller
{
    public function __construct(private TeacherPayoutService $payouts) {}

    /** GET /teacher-payouts?month=YYYY-MM */
    public function index(Request $request)
    {
        $f = $request->validate(['month' => ['required', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/']]);
        $rows = TeacherPayout::with(['teacher:id,user_id,employee_id', 'teacher.user:id,name', 'batch:id,name'])->where('month', $f['month'])->orderBy('teacher_id')->orderBy('batch_id')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($p) => self::row($p))->values(),
            'meta' => ['total' => \App\Support\Money::format($rows->sum(fn ($p) => \App\Support\Money::toPaisa((string) $p->amount)))]]);
    }

    /** POST /teacher-payouts/generate {month} */
    public function generate(Request $request)
    {
        $f = $request->validate(['month' => ['required', 'regex:/^\d{4}-(0[1-9]|1[0-2])$/']]);
        $this->payouts->generate($f['month'], $request->user());
        return $this->index($request);
    }

    /** PUT /teacher-payouts/{id} {amount?, note?} - draft only */
    public function update(Request $request, int $id)
    {
        $f = $request->validate(['amount' => ['nullable', 'regex:/^\d{1,8}(\.\d{1,2})?$/'], 'note' => 'nullable|string|max:255']);
        return response()->json(['success' => true, 'message' => __('messages.saved'),
            'data' => self::row($this->payouts->edit(TeacherPayout::findOrFail($id), $f['amount'] ?? null, $f['note'] ?? null)->load(['teacher:id,user_id,employee_id', 'teacher.user:id,name', 'batch:id,name']))]);
    }

    /** POST /teacher-payouts/{id}/approve */
    public function approve(int $id)
    {
        return response()->json(['success' => true, 'message' => __('messages.saved'),
            'data' => self::row($this->payouts->approve(TeacherPayout::findOrFail($id))->load(['teacher:id,user_id,employee_id', 'teacher.user:id,name', 'batch:id,name']))]);
    }

    /** POST /teacher-payouts/{id}/pay {method, date} */
    public function pay(Request $request, int $id)
    {
        $f = $request->validate(['method' => 'required|in:cash,bank,bkash,nagad,rocket,other', 'date' => 'required|date_format:Y-m-d|before_or_equal:today']);
        return response()->json(['success' => true, 'message' => __('messages.saved'),
            'data' => self::row($this->payouts->pay(TeacherPayout::findOrFail($id), $f['method'], $f['date'], $request->user())->load(['teacher:id,user_id,employee_id', 'teacher.user:id,name', 'batch:id,name']))]);
    }

    /** GET /teacher/payouts - D223 TPO.2: the signed-in teacher's own payouts (approved and paid; drafts are not final), read-only */
    public function mine(Request $request)
    {
        $teacher = \App\Models\Teacher::where('user_id', $request->user()->id)->first();
        $rows = $teacher ? TeacherPayout::with(['batch:id,name'])->where('teacher_id', $teacher->id)->whereIn('status', ['approved', 'paid'])
            ->orderByDesc('month')->orderBy('batch_id')->limit(240)->get() : collect();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($p) => array_diff_key(self::row($p), ['teacher' => 1, 'note' => 1]))->values()]);
    }

    public static function row(TeacherPayout $p): array
    {
        return ['id' => $p->id, 'teacher' => ['id' => $p->teacher_id, 'name' => $p->teacher?->user?->name ?? $p->teacher?->employee_id], 'batch' => $p->batch_id ? ['id' => $p->batch_id, 'name' => $p->batch?->name] : null,
            'month' => $p->month, 'classes_taken' => $p->classes_taken, 'collection_base' => (string) $p->collection_base, 'amount' => (string) $p->amount,
            'status' => $p->status, 'paid_at' => $p->paid_at?->toIso8601String(), 'note' => $p->note];
    }
}
