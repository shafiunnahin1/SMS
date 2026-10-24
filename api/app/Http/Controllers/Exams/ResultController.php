<?php

namespace App\Http\Controllers\Exams;

use App\Services\Exams\McqImportService;
use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Exams\BulkResultsRequest;
use App\Models\{Enrollment, Exam, ExamSubject, Result, Student};
use App\Services\{DepartmentAcademicReadService, DepartmentRequestContextService, DepartmentRoutePermissionResolver, ExamService, InstitutionSettings, PdfService, ResultService};
use App\Support\Tenancy;
use Illuminate\Http\Request;

// Step 4.5: marks entry (a teacher only for their own subjects - in their own batches unless they are the subject's teacher),
// the results grid, the marksheet PDF and the parent's view. A parent sees only PUBLISHED exams of their own child.
class ResultController extends Controller
{
    public function __construct(private ExamService $exams, private ResultService $results) {}

    /** GET /results - no exam_id: the exams and the subjects this user may enter; ?exam_id=: the marks grid (a teacher: own subjects) */
    public function index(Request $request)
    {
        $f = $request->validate(['exam_id' => 'nullable|integer']);
        if ($request->user()->role === 'institution_staff') $this->staffContext($request);   // D101: context and exact key even when no exam exists
        if (empty($f['exam_id'])) {
            $exams = Exam::with('program:id,name', 'batch:id,name')->orderByDesc('academic_year')->orderByDesc('id')->get()
                ->map(function ($exam) use ($request) {
                    $subjects = $this->exams->subjectsOf($exam)->filter(fn ($es) => $this->batchesFor($request, $exam, $es->subject_id) !== [])
                        ->map(fn ($es) => ['subject_id' => $es->subject_id, 'name' => $es->subject?->name, 'full_marks' => $es->full_marks])->values();
                    return ['id' => $exam->id, 'name' => $exam->name, 'status' => $exam->status, 'academic_year' => (int) $exam->academic_year,
                        'program' => $exam->program?->name, 'batch' => $exam->batch?->name, 'subjects' => $subjects];
                })->filter(fn ($e) => $e['subjects']->isNotEmpty())->values();
            return response()->json(['success' => true, 'data' => $exams]);
        }

        $exam = Exam::findOrFail($f['exam_id']);
        $subjects = $this->exams->subjectsOf($exam)->filter(fn ($es) => $this->batchesFor($request, $exam, $es->subject_id) !== [])->values();
        if ($subjects->isEmpty()) throw new BusinessException('no subject of yours', 'forbidden', 403);
        $marks = Result::where('exam_id', $exam->id)->whereIn('subject_id', $subjects->pluck('subject_id'))->get()->groupBy('student_id');
        $students = Student::whereIn('id', $marks->keys())->with('user:id,name')->get()->keyBy('id');
        return response()->json(['success' => true, 'data' => [
            'exam' => ['id' => $exam->id, 'name' => $exam->name, 'status' => $exam->status],
            'subjects' => $subjects->map(fn ($es) => ['subject_id' => $es->subject_id, 'name' => $es->subject?->name, 'full_marks' => $es->full_marks])->values(),
            'rows' => $marks->map(fn ($rs, $sid) => ['student_id' => (int) $sid, 'name' => $students[$sid]?->user?->name, 'code' => $students[$sid]?->student_id,
                'marks' => $rs->mapWithKeys(fn ($r) => [$r->subject_id => ['id' => $r->id, 'marks_obtained' => $r->marks_obtained, 'grade' => $r->grade, 'is_absent' => $r->is_absent]])])
                ->sortBy('name')->values(),
        ]]);
    }

    /** GET /exams/{id}/subjects/{subjectId}/entry - the entry sheet: limits, parts and the students who sit it */
    public function entrySheet(Request $request, int $id, int $subjectId)
    {
        [$exam, $es, $batchIds] = $this->entryScope($request, $id, $subjectId);
        $saved = Result::where('exam_id', $exam->id)->where('subject_id', $subjectId)->get()->keyBy('student_id');
        return response()->json(['success' => true, 'data' => [
            'exam' => ['id' => $exam->id, 'name' => $exam->name, 'status' => $exam->status],
            'subject' => ['subject_id' => $es->subject_id, 'name' => $es->subject?->name, 'full_marks' => $es->full_marks, 'pass_marks' => $es->pass_marks, 'components' => $es->components],
            'rows' => $this->exams->sitters($exam, $es, $batchIds)->map(fn ($e) => ['student_id' => $e->student_id, 'code' => $e->student?->student_id,
                'name' => $e->student?->user?->name, 'roll_no' => $e->roll_no, 'batch' => $e->batch?->name, 'result' => $this->resultRow($saved->get($e->student_id))])->values(),
        ]]);
    }

    /** D158 (5)(6): POST - {source: json|omr, rows?: [{id? | roll, batch?, mcq}], save: bool}; answers the checked rows */
    public function mcqImport(Request $request, int $id, int $subjectId, McqImportService $import)
    {
        [$exam, $es, $batchIds] = $this->entryScope($request, $id, $subjectId);   // another institution's exam is 404 first
        $data = $request->validate(['source' => 'required|in:json,omr', 'save' => 'boolean', 'rows' => 'required_if:source,json|array|max:2000',
            'rows.*' => 'array', 'rows.*.id' => 'nullable|string|max:20', 'rows.*.roll' => 'nullable', 'rows.*.batch' => 'nullable|string|max:100', 'rows.*.mcq' => 'nullable']);
        if ($exam->status === 'published') throw new BusinessException('exam is published', 'exam_published', 422);
        $save = (bool) ($data['save'] ?? false);
        $out = $data['source'] === 'omr' ? $import->fromOmr($exam, $es, $batchIds, $save) : $import->fromRows($exam, $es, $data['rows'], $batchIds, $save);
        return response()->json(['success' => true, 'data' => $out]);
    }

    /** POST /results/bulk - one subject of one exam; answers with the server's grades */
    public function bulkStore(BulkResultsRequest $request)
    {
        $data = $request->validated();
        [$exam, $es, $batchIds] = $this->entryScope($request, (int) $data['exam_id'], (int) $data['subject_id']);
        $saved = $this->exams->saveMarks($exam, $es, $data['rows'], $batchIds);
        foreach ($data['rows'] as $r) {
            if (array_key_exists('teacher_remarks', $r)) Result::where('exam_id', $exam->id)->where('subject_id', $es->subject_id)->where('student_id', $r['student_id'])->update(['teacher_remarks' => $r['teacher_remarks']]);
        }
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $saved->map(fn ($r) => ['student_id' => $r->student_id] + $this->resultRow($r->fresh()))->values()]);
    }

    /** PUT /results/{id} - one mark; after publishing only an admin may correct */
    public function update(Request $request, int $id)
    {
        $result = Result::findOrFail($id);
        $exam = Exam::findOrFail($result->exam_id);
        $es = ExamSubject::where('exam_id', $exam->id)->where('subject_id', $result->subject_id)->with('subject')->firstOrFail();
        $batchIds = $this->batchesFor($request, $exam, $es->subject_id);
        if ($batchIds === [] || ($batchIds !== null && !$this->exams->sitters($exam, $es, $batchIds)->contains('student_id', $result->student_id))) {
            throw new BusinessException('not your subject', 'forbidden', 403);
        }
        if ($exam->status === 'published' && $request->user()->role !== 'admin') throw new BusinessException('published', 'exam_published', 422);
        $data = $request->validate(['marks_obtained' => 'nullable|numeric|min:0|max:1000', 'components' => 'nullable|array', 'components.*' => 'nullable|numeric|min:0|max:1000',
            'is_absent' => 'nullable|boolean', 'teacher_remarks' => 'nullable|string|max:255']);
        $before = ['marks_obtained' => $result->marks_obtained, 'grade' => $result->grade];
        $result->update($this->results->score($es, isset($data['marks_obtained']) ? (float) $data['marks_obtained'] : null, $data['components'] ?? null, (bool) ($data['is_absent'] ?? false))
            + (array_key_exists('teacher_remarks', $data) ? ['teacher_remarks' => $data['teacher_remarks']] : []));
        // D161 (3): the admin changed a published mark - the guardian gets a correction SMS with the old and new result
        if ($exam->status === 'published' && ((string) $before['marks_obtained'] !== (string) $result->marks_obtained || $before['grade'] !== $result->grade)) {
            app(\App\Services\Exams\ResultSmsService::class)->correction($exam, $result->fresh('subject'), $before, $request->user());
        }
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['student_id' => $result->student_id] + $this->resultRow($result->fresh())]);
    }

    /** GET /results/marksheet/{studentId}?exam_id= (PDF; ?format=json for the screen). Parent: own child only (404), published only (403). */
    public function marksheet(Request $request, int $studentId, PdfService $pdf)
    {
        $examId = (int) $request->validate(['exam_id' => 'required|integer', 'format' => 'nullable|in:json,pdf'])['exam_id'];
        $student = $this->reachable($request, $studentId);
        $exam = Exam::with('program:id,name')->findOrFail($examId);
        if ($request->user()->role === 'parent' && $exam->status !== 'published') throw new BusinessException('not published', 'forbidden', 403);
        $sheet = $this->exams->sheet($exam, $student, $this->useGpa());
        if ($request->query('format') === 'json') return response()->json(['success' => true, 'data' => $sheet]);
        return response($pdf->render('pdf.marksheet', ['sheet' => $sheet]), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="marksheet-' . $student->student_id . '-' . $exam->id . '.pdf"',
        ]);
    }

    /** GET /parent/children/{id}/results - the child's PUBLISHED exams, newest first */
    public function forParent(Request $request, int $id)
    {
        $student = $this->reachable($request, $id);
        $examIds = Result::where('student_id', $student->id)->distinct()->pluck('exam_id');
        $exams = Exam::with('program:id,name')->whereIn('id', $examIds)->where('status', 'published')->orderByDesc('academic_year')->orderByDesc('id')->get();
        $gpa = $this->useGpa();
        return response()->json(['success' => true, 'data' => [
            'student' => ['id' => $student->id, 'name' => $student->user?->name, 'code' => $student->student_id],
            'exams' => $exams->map(fn ($e) => $this->exams->sheet($e, $student, $gpa))->values(),
        ]]);
    }

    /** @return array{0: Exam, 1: ExamSubject, 2: ?array} */
    private function entryScope(Request $request, int $examId, int $subjectId): array
    {
        $exam = Exam::findOrFail($examId);
        $es = ExamSubject::where('exam_id', $exam->id)->where('subject_id', $subjectId)->with('subject')->firstOrFail();
        $batchIds = $this->batchesFor($request, $exam, $subjectId);
        if ($batchIds === []) throw new BusinessException('not your subject', 'forbidden', 403);
        return [$exam, $es, $batchIds];
    }

    /** Legacy roles keep ExamService::batchesFor; D101 department staff get only explicit active own subject assignments */
    private function batchesFor(Request $request, Exam $exam, int $subjectId): ?array
    {
        if ($request->user()->role !== 'institution_staff') return $this->exams->batchesFor($request->user(), $exam, $subjectId);
        [$department, $permission] = $this->staffContext($request);
        return app(DepartmentAcademicReadService::class)->ownSubjectBatchIds($request->user(), $department, $permission, $subjectId, $exam->batch_id ? (int) $exam->batch_id : null);
    }

    private function staffContext(Request $request): array
    {
        // cached on the request, never on the controller: the router reuses one controller instance across requests
        if (!$request->attributes->has('d101.staff_context')) $request->attributes->set('d101.staff_context', [
            app(DepartmentRequestContextService::class)->forRoute($request), app(DepartmentRoutePermissionResolver::class)->resolve($request)['permission']]);
        return $request->attributes->get('d101.staff_context');
    }

    private function reachable(Request $request, int $id): Student
    {
        $user = $request->user();
        if ($user->role === 'institution_staff') {
            // D101: a marksheet only for a student actively enrolled in one of the staff member's own batches
            [$department, $permission] = $this->staffContext($request);
            $own = app(DepartmentAcademicReadService::class)->ownBatchQuery($user, $department, $permission)->select('id');
            if (!Enrollment::where('student_id', $id)->where('status', 'active')->whereIn('batch_id', $own)->exists()) throw new BusinessException('not your student', 'forbidden', 403);
        }
        return Student::with('user:id,name')->whereKey($id)
            ->when($user->role === 'parent', fn ($q) => $q->whereHas('parents', fn ($p) => $p->whereKey($user->id)))->firstOrFail();
    }

    private function useGpa(): bool
    {
        return app(InstitutionSettings::class)->general(Tenancy::current())['use_gpa'];
    }

    private function resultRow(?Result $r): ?array
    {
        return $r ? ['id' => $r->id, 'marks_obtained' => $r->marks_obtained, 'component_marks' => $r->component_marks, 'percentage' => $r->percentage,
            'grade' => $r->grade, 'grade_point' => $r->grade_point, 'is_absent' => $r->is_absent, 'is_pass' => $r->is_pass, 'teacher_remarks' => $r->teacher_remarks] : null;
    }
}
