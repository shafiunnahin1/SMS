<?php

namespace App\Http\Controllers\Homework;

use App\Http\Controllers\Controller;
use App\Models\{Homework, Student, Subject, Teacher};
use App\Services\Homework\HomeworkService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

// D212 HW.1: homework - the teacher (own) and the admin (all) list, give, edit and delete; a student sees the homework of their
// active enrollments, a parent their child's; the attached file is served to those who may see the homework.
class HomeworkController extends Controller
{
    public function __construct(private HomeworkService $homework) {}

    /** GET /homework - teacher: own; admin: all */
    public function index(Request $request)
    {
        $f = $request->validate(['program_id' => 'nullable|integer', 'batch_id' => 'nullable|integer', 'page' => 'nullable|integer|min:1']);
        $q = Homework::with(['subject:id,name', 'program:id,name', 'batch:id,name', 'teacher:id,user_id', 'teacher.user:id,name'])
            ->when($request->user()->role === 'teacher', fn ($w) => $w->where('teacher_id', $this->teacher($request)->id))
            ->when($f['program_id'] ?? null, fn ($w, $p) => $w->where('program_id', $p))->when($f['batch_id'] ?? null, fn ($w, $b) => $w->where('batch_id', $b))
            ->orderByDesc('id');
        return $this->page($q->paginate(30));
    }

    /** POST /homework (multipart: program_id, batch_id?, subject_id, title, description?, due_date?, file?, teacher_id when the admin gives it) */
    public function store(Request $request)
    {
        $t = Tenancy::current()->id;
        $d = $request->validate([
            'program_id' => ['required', 'integer', Rule::exists('programs', 'id')->where('institution_id', $t)],
            'batch_id' => ['nullable', 'integer', Rule::exists('batches', 'id')->where('institution_id', $t)->where('program_id', $request->input('program_id'))],
            'subject_id' => ['required', 'integer', Rule::exists('subjects', 'id')->where('institution_id', $t)->where('program_id', $request->input('program_id'))],
            'teacher_id' => [$request->user()->role === 'admin' ? 'required' : 'prohibited', 'integer', Rule::exists('teachers', 'id')->where('institution_id', $t)],
            'title' => 'required|string|max:150', 'description' => 'nullable|string|max:5000', 'due_date' => 'nullable|date_format:Y-m-d|after_or_equal:today',
            'file' => 'nullable|file|max:5120|mimes:pdf,jpg,jpeg,png,webp',
        ]);
        $teacher = $request->user()->role === 'teacher' ? $this->teacher($request) : Teacher::findOrFail($d['teacher_id']);
        if ($request->user()->role === 'teacher' && !$this->homework->teaches($teacher, Subject::findOrFail($d['subject_id']), $d['batch_id'] ?? null)) {
            abort(403, __('errors.not_your_subject'));
        }
        $hw = $this->homework->create($d, $teacher, $request->user(), $request->file('file'));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($hw->load(['subject:id,name', 'program:id,name', 'batch:id,name']))], 201);
    }

    public function show(Request $request, int $id)
    {
        return response()->json(['success' => true, 'data' => $this->row($this->visible($request, $id)->load(['subject:id,name', 'program:id,name', 'batch:id,name']))]);
    }

    /** PUT /homework/{id} (title, description, due_date, file) - its teacher or the admin */
    public function update(Request $request, int $id)
    {
        $hw = $this->owned($request, $id);
        $d = $request->validate(['title' => 'sometimes|required|string|max:150', 'description' => 'nullable|string|max:5000', 'due_date' => 'nullable|date_format:Y-m-d',
            'file' => 'nullable|file|max:5120|mimes:pdf,jpg,jpeg,png,webp']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($this->homework->update($hw, $d, $request->file('file'))->load(['subject:id,name', 'program:id,name', 'batch:id,name']))]);
    }

    public function destroy(Request $request, int $id)
    {
        $hw = $this->owned($request, $id);
        $hw->delete();
        \App\Models\AuditLog::record('homework.deleted', $hw);
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** GET /homework/{id}/file */
    public function file(Request $request, int $id)
    {
        $hw = $this->visible($request, $id);
        abort_unless($hw->file_path && Storage::disk('private')->exists($hw->file_path), 404);
        return Storage::disk('private')->response($hw->file_path, 'homework-' . $hw->id . '.' . pathinfo($hw->file_path, PATHINFO_EXTENSION));
    }

    /** GET /student/homework - the homework of the student's active enrollments, newest first */
    public function mine(Request $request)
    {
        return $this->page($this->forStudent(Student::where('user_id', $request->user()->id)->firstOrFail())->paginate(30));
    }

    /** GET /parent/homework?student_id= - one child's */
    public function child(Request $request)
    {
        $d = $request->validate(['student_id' => 'required|integer']);
        $student = Student::whereKey($d['student_id'])->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail();
        return $this->page($this->forStudent($student)->paginate(30));
    }

    private function forStudent(Student $s)
    {
        $e = $s->activeEnrollments()->get(['program_id', 'batch_id']);
        return Homework::with(['subject:id,name', 'program:id,name', 'batch:id,name'])->where(function ($q) use ($e) {
            foreach ($e as $en) $q->orWhere(fn ($w) => $w->where('program_id', $en->program_id)->where(fn ($b) => $b->whereNull('batch_id')->orWhere('batch_id', $en->batch_id)));
            if ($e->isEmpty()) $q->whereRaw('1 = 0');
        })->orderByDesc('id');
    }

    /** the teacher of the homework or the admin */
    private function owned(Request $request, int $id): Homework
    {
        $hw = Homework::findOrFail($id);
        if ($request->user()->role === 'teacher' && $hw->teacher_id !== $this->teacher($request)->id) abort(404);
        return $hw;
    }

    /** who may see one homework: admin, its teacher, a student of its target, a parent of one */
    private function visible(Request $request, int $id): Homework
    {
        $u = $request->user();
        $hw = Homework::findOrFail($id);
        $ok = match ($u->role) {
            'admin' => true,
            'teacher' => $hw->teacher_id === $this->teacher($request)->id,
            'student' => $hw->audience()->where('user_id', $u->id)->exists(),
            'parent' => $hw->audience()->whereHas('parents', fn ($q) => $q->whereKey($u->id))->exists(),
            default => false,
        };
        abort_unless($ok, 404);
        return $hw;
    }

    private function teacher(Request $request): Teacher
    {
        return Teacher::where('user_id', $request->user()->id)->firstOrFail();
    }

    private function page($page)
    {
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($h) => $this->row($h))->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    private function row(Homework $h): array
    {
        return ['id' => $h->id, 'title' => $h->title, 'description' => $h->description, 'due_date' => $h->due_date?->toDateString(), 'has_file' => (bool) $h->file_path,
            'subject' => $h->subject ? ['id' => $h->subject->id, 'name' => $h->subject->name] : null, 'program' => $h->program ? ['id' => $h->program->id, 'name' => $h->program->name] : null,
            'batch' => $h->batch ? ['id' => $h->batch->id, 'name' => $h->batch->name] : null, 'teacher' => $h->teacher?->user?->name, 'created_at' => $h->created_at?->toIso8601String()];
    }
}
