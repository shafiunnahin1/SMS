<?php

namespace App\Services\Exams;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Exam, ExamMarkSubmission, ExamSubject, Result, User};
use App\Notifications\GeneralNotification;
use App\Services\ExamService;

/**
 * D162: a teacher keeps an exam subject's marks as a draft, submits them to the head (admin) when every sitting student has a mark
 * or is absent, and after that may only ask to update them; the head approves (the teacher edits and submits again) or rejects,
 * and may return a submitted subject to draft. The admin edits at any state before publishing; publishing is not blocked.
 */
class MarkSubmissionService
{
    public const LOCKED = ['submitted', 'unlock_requested'];

    public function __construct(private ExamService $exams) {}

    public function stateOf(ExamSubject $es): array
    {
        $row = ExamMarkSubmission::where('exam_subject_id', $es->id)->first();
        return ['status' => $row?->status ?? 'draft', 'submitted_at' => $row?->submitted_at?->toIso8601String(), 'request_reason' => $row?->request_reason,
            'requested_at' => $row?->requested_at?->toIso8601String(), 'decision_note' => $row?->decision_note, 'decided_at' => $row?->decided_at?->toIso8601String()];
    }

    /** a teacher's (or staff's) save is refused once the subject is submitted; the admin may always edit before publishing */
    public function assertEditable(ExamSubject $es, User $user): void
    {
        if ($user->role === 'admin') return;
        if (in_array($this->stateOf($es)['status'], self::LOCKED, true)) throw new BusinessException('marks are submitted', 'marks_submitted', 422);
    }

    /** subject names of the exam not yet submitted (draft / unlock_requested / unlocked) - the publish warning */
    public function unsubmitted(Exam $exam): array
    {
        $done = ExamMarkSubmission::whereIn('exam_subject_id', ExamSubject::where('exam_id', $exam->id)->pluck('id'))->where('status', 'submitted')->pluck('exam_subject_id')->flip();
        return $this->exams->subjectsOf($exam)->reject(fn ($es) => isset($done[$es->id]))->map(fn ($es) => ['subject_id' => $es->subject_id, 'name' => $es->subject?->name])->values()->all();
    }

    public function act(Exam $exam, ExamSubject $es, string $action, User $user, array $data = []): array
    {
        if ($exam->status === 'published') throw new BusinessException('exam is published', 'exam_published', 422);
        $row = ExamMarkSubmission::firstOrNew(['exam_subject_id' => $es->id], ['status' => 'draft']);
        $status = $row->status ?? 'draft';
        $admin = $user->role === 'admin';
        $refuse = fn () => throw new BusinessException('not allowed in this state', 'marks_submission_state', 422, ['status' => $status]);
        $now = now();
        switch ($action) {
            case 'submit':
                if (!in_array($status, ['draft', 'unlocked'], true)) $refuse();
                $missing = $this->missing($exam, $es);
                if ($missing > 0) throw new BusinessException('every student needs a mark or absent', 'marks_incomplete', 422, ['missing' => $missing]);
                $row->fill(['status' => 'submitted', 'submitted_by' => $user->id, 'submitted_at' => $now]);
                break;
            case 'request':
                if ($admin || $status !== 'submitted') $refuse();
                $row->fill(['status' => 'unlock_requested', 'request_reason' => $data['reason'], 'requested_by' => $user->id, 'requested_at' => $now, 'decision_note' => null, 'decided_by' => null, 'decided_at' => null]);
                break;
            case 'approve':
            case 'reject':
                if (!$admin || $status !== 'unlock_requested') $refuse();
                $row->fill(['status' => $action === 'approve' ? 'unlocked' : 'submitted', 'decided_by' => $user->id, 'decided_at' => $now, 'decision_note' => $data['note'] ?? null]);
                break;
            case 'reopen':
                if (!$admin || !in_array($status, self::LOCKED, true)) $refuse();
                $row->fill(['status' => 'draft', 'decided_by' => $user->id, 'decided_at' => $now, 'decision_note' => $data['note'] ?? null]);
                break;
        }
        $row->save();
        AuditLog::record("exam.marks_{$action}", $exam, ['subject_id' => $es->subject_id, 'status' => $row->status]);
        $this->tell($exam, $es, $action, $row, $user);
        return $this->stateOf($es);
    }

    /** sitting students of the subject (every batch) with no saved mark and not absent */
    private function missing(Exam $exam, ExamSubject $es): int
    {
        $done = Result::where('exam_id', $exam->id)->where('subject_id', $es->subject_id)
            ->where(fn ($q) => $q->whereNotNull('marks_obtained')->orWhere('is_absent', true))->pluck('student_id')->flip();
        return $this->exams->sitters($exam, $es)->reject(fn ($e) => isset($done[$e->student_id]))->count();
    }

    /** in-app only (D162 (3)): submit / request go to the heads; approve / reject / reopen to the teacher who submitted or asked */
    private function tell(Exam $exam, ExamSubject $es, string $action, ExamMarkSubmission $row, User $actor): void
    {
        $vars = ['exam' => $exam->name, 'subject' => $es->subject?->name, 'name' => $actor->name];
        $to = in_array($action, ['submit', 'request'], true)
            ? User::where('institution_id', $exam->institution_id)->where('role', 'admin')->where('is_active', true)->get()
            : User::whereKey(array_filter([$row->requested_by, $row->submitted_by]))->get();
        foreach ($to->reject(fn ($u) => $u->id === $actor->id) as $u) {
            $u->notify(new GeneralNotification(__("exams.submission.{$action}_title", $vars), __("exams.submission.{$action}_body", $vars + ['reason' => $row->request_reason, 'note' => $row->decision_note]),
                'exam_marks', ['exam_id' => $exam->id, 'subject_id' => $es->subject_id]));
        }
    }
}
