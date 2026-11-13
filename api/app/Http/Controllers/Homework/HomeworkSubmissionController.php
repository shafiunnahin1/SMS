<?php

namespace App\Http\Controllers\Homework;

use App\Http\Controllers\Controller;
use App\Models\{Homework, HomeworkSubmission, Student, Teacher};
use App\Services\Homework\SubmissionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

// D212 HW.2: submissions - the student submits online; the homework's teacher (or the admin) sees every target student with their
// submission, marks paper hand-ins and grades; a student sees their own submissions, a parent their child's; the submitted file is
// served to the student, their parents, the homework's teacher and the admin.
class HomeworkSubmissionController extends Controller
{
    public function __construct(private SubmissionService $subs) {}

    /** POST /homework/{id}/submit (student; multipart: text_answer?, file?) */
    public function submit(Request $request, int $id)
    {
        $s = Student::where('user_id', $request->user()->id)->firstOrFail();
        $hw = Homework::findOrFail($id);
        abort_unless($hw->audience()->whereKey($s->id)->exists(), 404);
        $d = $request->validate(['text_answer' => 'nullable|string|max:10000', 'file' => 'nullable|file|max:5120|mimes:pdf,jpg,jpeg,png,webp']);
        $sub = $this->subs->submit($hw, $s, $d['text_answer'] ?? null, $request->file('file'));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($sub)], 201);
    }

    /** GET /homework/{id}/submissions (its teacher, admin): every target student, with or without a submission */
    public function index(Request $request, int $id)
    {
        $hw = $this->owned($request, $id);
        $subs = HomeworkSubmission::where('homework_id', $hw->id)->get()->keyBy('student_id');
        $rows = $hw->audience()->with('user:id,name')->orderBy('id')->get()->map(fn ($s) => ['student' => ['id' => $s->id, 'name' => $s->user?->name, 'student_id' => $s->student_id],
            'submission' => isset($subs[$s->id]) ? $this->row($subs[$s->id]) : null])->values();
        return response()->json(['success' => true, 'data' => $rows, 'meta' => ['submitted' => $subs->count(), 'total' => $rows->count()]]);
    }

    /** POST /homework/{id}/paper {student_id} (its teacher, admin) */
    public function paper(Request $request, int $id)
    {
        $hw = $this->owned($request, $id);
        $d = $request->validate(['student_id' => 'required|integer']);
        $s = $hw->audience()->whereKey($d['student_id'])->firstOrFail();
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($this->subs->markPaper($hw, $s))], 201);
    }

    /** POST /homework/submissions/{id}/grade {grade?, feedback?} (its teacher, admin) */
    public function grade(Request $request, int $id)
    {
        $sub = HomeworkSubmission::findOrFail($id);
        $this->owned($request, $sub->homework_id);
        $d = $request->validate(['grade' => 'nullable|string|max:10', 'feedback' => 'nullable|string|max:2000']);
        abort_if(blank($d['grade'] ?? null) && blank($d['feedback'] ?? null), 422, __('errors.empty_submission'));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($this->subs->grade($sub, $d['grade'] ?? null, $d['feedback'] ?? null))]);
    }

    /** GET /homework/options - what the give-homework form may offer: a teacher the subjects they teach (with their program and
     *  batches), the admin every subject and the teachers to name */
    public function options(Request $request)
    {
        $u = $request->user();
        $subjects = \App\Models\Subject::with('program:id,name')->orderBy('program_id')->orderBy('name')->get(['id', 'name', 'program_id', 'teacher_id']);
        $teacherId = $u->role === 'teacher' ? Teacher::where('user_id', $u->id)->value('id') : null;
        $bt = \App\Models\BatchTeacher::when($teacherId, fn ($q) => $q->where('teacher_id', $teacherId))->get(['batch_id', 'subject_id']);
        if ($teacherId) $subjects = $subjects->filter(fn ($s) => (int) $s->teacher_id === $teacherId || $bt->contains('subject_id', $s->id))->values();
        $batches = \App\Models\Batch::whereIn('program_id', $subjects->pluck('program_id')->unique())->orderBy('name')->get(['id', 'name', 'program_id']);
        return response()->json(['success' => true, 'data' => [
            'subjects' => $subjects->map(fn ($s) => ['id' => $s->id, 'name' => $s->name, 'program' => ['id' => $s->program_id, 'name' => $s->program?->name],
                // a teacher who teaches the subject only in some batches may give it only there; null = every batch of the program
                'batch_ids' => $teacherId && (int) $s->teacher_id !== $teacherId ? $bt->where('subject_id', $s->id)->pluck('batch_id')->values() : null])->values(),
            'batches' => $batches->map(fn ($b) => ['id' => $b->id, 'name' => $b->name, 'program_id' => $b->program_id])->values(),
            'teachers' => $u->role === 'admin' ? Teacher::with('user:id,name')->get()->map(fn ($t) => ['id' => $t->id, 'name' => $t->user?->name])->values() : [],
        ]]);
    }

    /** GET /student/homework/submitted */
    public function mine(Request $request)
    {
        $s = Student::where('user_id', $request->user()->id)->firstOrFail();
        return $this->listFor($s);
    }

    /** GET /parent/homework/submitted?student_id= */
    public function child(Request $request)
    {
        $d = $request->validate(['student_id' => 'required|integer']);
        return $this->listFor(Student::whereKey($d['student_id'])->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail());
    }

    /** GET /homework/submissions/{id}/file */
    public function file(Request $request, int $id)
    {
        $sub = HomeworkSubmission::findOrFail($id);
        $u = $request->user();
        $ok = match ($u->role) {
            'admin' => true,
            'teacher' => Homework::whereKey($sub->homework_id)->where('teacher_id', Teacher::where('user_id', $u->id)->value('id'))->exists(),
            'student' => Student::whereKey($sub->student_id)->where('user_id', $u->id)->exists(),
            'parent' => Student::whereKey($sub->student_id)->whereHas('parents', fn ($q) => $q->whereKey($u->id))->exists(),
            default => false,
        };
        abort_unless($ok && $sub->file_path && Storage::disk('private')->exists($sub->file_path), 404);
        return Storage::disk('private')->response($sub->file_path, 'submission-' . $sub->id . '.' . pathinfo($sub->file_path, PATHINFO_EXTENSION));
    }

    private function listFor(Student $s)
    {
        $rows = HomeworkSubmission::with('homework:id,title,due_date')->where('student_id', $s->id)->orderByDesc('id')->limit(200)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($r) => $this->row($r) + ['homework' => $r->homework ? ['id' => $r->homework->id, 'title' => $r->homework->title] : null])->values()]);
    }

    private function owned(Request $request, int $homeworkId): Homework
    {
        $hw = Homework::findOrFail($homeworkId);
        if ($request->user()->role === 'teacher' && $hw->teacher_id !== Teacher::where('user_id', $request->user()->id)->value('id')) abort(404);
        return $hw;
    }

    private function row(HomeworkSubmission $s): array
    {
        return ['id' => $s->id, 'homework_id' => $s->homework_id, 'student_id' => $s->student_id, 'text_answer' => $s->text_answer, 'has_file' => (bool) $s->file_path,
            'on_paper' => !$s->file_path && !$s->text_answer, 'submitted_at' => $s->submitted_at?->toIso8601String(), 'status' => $s->status,
            'grade' => $s->grade, 'feedback' => $s->teacher_feedback, 'feedback_at' => $s->feedback_at?->toIso8601String()];
    }
}
