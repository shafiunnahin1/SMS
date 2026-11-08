<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, DueBlockExemption, Enrollment, Exam, Student};
use App\Services\Fees\DueBlockService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D197 AAD.1 (academics-advanced.md section 2 endpoints): a student's block state, exemptions (admin / accountant; each audited),
// and the exam's held-back admit cards (admin).
class DueBlockController extends Controller
{
    public function __construct(private DueBlockService $blocks) {}

    /** GET /students/{id}/due-block */
    public function show(int $id)
    {
        $s = Student::findOrFail($id);
        $a = $this->blocks->isBlocked($s, 'admit_card');
        $r = $this->blocks->isBlocked($s, 'result');
        return response()->json(['success' => true, 'data' => ['blocked' => ['admit_card' => (bool) $a, 'result' => (bool) $r],
            'due_amount' => ($a ?? $r)['due_amount'] ?? null, 'reason' => ($a ?? $r)['reason'] ?? null,
            'exemptions' => DueBlockExemption::where('student_id', $s->id)->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>=', now()->toDateString()))
                ->orderByDesc('id')->get(['id', 'scope', 'reason', 'expires_at', 'created_at'])->map(fn ($e) => ['id' => $e->id, 'scope' => $e->scope, 'reason' => $e->reason,
                    'expires_at' => $e->expires_at?->toDateString()])->values()]]);
    }

    /** POST /students/{id}/due-block-exemptions {scope, reason, expires_at?} */
    public function grant(Request $request, int $id)
    {
        $s = Student::findOrFail($id);
        $d = $request->validate(['scope' => ['required', Rule::in(DueBlockExemption::SCOPES)], 'reason' => 'required|string|min:3|max:255',
            'expires_at' => 'nullable|date|after_or_equal:today']);
        $e = DueBlockExemption::create($d + ['student_id' => $s->id, 'granted_by' => $request->user()->id]);
        AuditLog::record('fees.due_block_exempted', $e, ['student_id' => $s->id, 'scope' => $e->scope, 'expires_at' => $e->expires_at?->toDateString()]);
        return $this->show($s->id)->setStatusCode(201);
    }

    /** DELETE /students/{id}/due-block-exemptions?scope= - ends the student's exemptions (of that scope, or all) */
    public function revoke(Request $request, int $id)
    {
        $s = Student::findOrFail($id);
        $scope = $request->validate(['scope' => ['nullable', Rule::in(DueBlockExemption::SCOPES)]])['scope'] ?? null;
        $rows = DueBlockExemption::where('student_id', $s->id)->when($scope, fn ($q) => $q->where('scope', $scope))->get();
        foreach ($rows as $e) {
            AuditLog::record('fees.due_block_exemption_removed', $e, ['student_id' => $s->id, 'scope' => $e->scope]);
            $e->delete();
        }
        return $this->show($s->id);
    }

    /** GET /exams/{id}/admit-cards/blocked - the exam's students whose admit card the dues hold back */
    public function blockedForExam(int $id)
    {
        $exam = Exam::findOrFail($id);
        $rows = Enrollment::with('student.user:id,name')->where('program_id', $exam->program_id)->where('status', 'active')
            ->when($exam->batch_id, fn ($q) => $q->where('batch_id', $exam->batch_id))->get()->unique('student_id')
            ->map(fn ($e) => ($b = $e->student ? $this->blocks->isBlocked($e->student, 'admit_card') : null)
                ? ['student_id' => $e->student_id, 'code' => $e->student->student_id, 'name' => $e->student->user?->name, 'roll' => $e->roll_no, 'due_amount' => $b['due_amount']] : null)
            ->filter()->values();
        return response()->json(['success' => true, 'data' => $rows]);
    }
}
