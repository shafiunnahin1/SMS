<?php

namespace App\Http\Controllers\Exams;

use App\Exceptions\BusinessException;
use App\Exports\SimpleSheetExport;
use App\Http\Controllers\Controller;
use App\Http\Requests\Exams\ResultSheetRequest;
use App\Models\{AuditLog, BatchTeacher, FinalResult, ResultSheet, Student, Teacher};
use App\Services\Exams\FinalResultService;
use App\Services\Fees\DueBlockService;
use App\Services\PdfService;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

// D197 AAD.2 (academics-advanced.md section 1.5): result sheets - the admin writes the rule, computes, previews, publishes (then it
// is frozen; changes = a new version); the teacher previews a sheet of a batch they teach; the student / parent read their own
// published final results (the dues block applies). Tabulation sheet PDF (landscape; A3 above eight subjects) and Excel.
class ResultSheetController extends Controller
{
    public function __construct(private FinalResultService $final) {}

    public function index()
    {
        $rows = ResultSheet::with(['program:id,name', 'batch:id,name'])->withCount('results')->orderByDesc('id')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($r) => $this->row($r))->values()]);
    }

    public function store(ResultSheetRequest $request)
    {
        $s = ResultSheet::create($request->validated() + ['status' => 'draft', 'version' => 1, 'created_by' => $request->user()->id]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($s->load(['program:id,name', 'batch:id,name']))], 201);
    }

    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => $this->row(ResultSheet::with(['program:id,name', 'batch:id,name'])->withCount('results')->findOrFail($id))]);
    }

    public function update(int $id)
    {
        $s = $this->draft($id);
        $s->update(app(ResultSheetRequest::class)->validated());
        FinalResult::where('result_sheet_id', $s->id)->delete();                    // the rule changed: old numbers no longer apply
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($s->fresh(['program:id,name', 'batch:id,name']))]);
    }

    public function destroy(int $id)
    {
        $s = $this->draft($id);
        FinalResult::where('result_sheet_id', $s->id)->delete();
        $s->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    public function compute(int $id)
    {
        $out = $this->final->compute($this->draft($id));
        return response()->json(['success' => true, 'data' => $out], $out['missing'] ? 422 : 200);
    }

    public function preview(Request $request, int $id)
    {
        $s = ResultSheet::with(['program:id,name', 'batch:id,name'])->findOrFail($id);
        if ($request->user()->role === 'teacher') {
            $teacher = Teacher::where('user_id', $request->user()->id)->first();
            $mine = $teacher ? BatchTeacher::where('teacher_id', $teacher->id)->pluck('batch_id')->all() : [];
            $batchIds = $s->batch_id ? [$s->batch_id] : \App\Models\Batch::where('program_id', $s->program_id)->pluck('id')->all();
            if (!array_intersect($mine, $batchIds)) abort(403);
        }
        $rows = FinalResult::with('student.user:id,name')->where('result_sheet_id', $s->id)->get()
            ->sortBy(fn ($r) => [$r->position_program === null ? 1 : 0, $r->position_program ?? 0, $r->student?->user?->name])->values();
        return response()->json(['success' => true, 'data' => ['sheet' => $this->row($s), 'results' => $rows->map(fn ($r) => $this->result($r))->values()]]);
    }

    public function publish(Request $request, int $id)
    {
        $s = $this->draft($id);
        $reason = $request->validate(['reason' => 'nullable|string|max:255'])['reason'] ?? null;
        if (!FinalResult::where('result_sheet_id', $s->id)->exists()) throw new BusinessException('compute first', 'result_sheet_not_computed', 422);
        $s->update(['status' => 'published', 'published_at' => now()]);
        AuditLog::record('result_sheet.published', $s, ['reason' => $reason, 'version' => $s->version]);
        return response()->json(['success' => true, 'data' => $this->row($s->fresh(['program:id,name', 'batch:id,name']))]);
    }

    /** POST /result-sheets/{id}/new-version: a draft copy of a published sheet (the published one stays as it is) */
    public function newVersion(Request $request, int $id)
    {
        $s = ResultSheet::findOrFail($id);
        if ($s->status !== 'published') throw new BusinessException('draft', 'result_sheet_not_published', 422);
        $next = (int) ResultSheet::where('program_id', $s->program_id)->where('name', $s->name)->max('version') + 1;
        $copy = ResultSheet::create(['program_id' => $s->program_id, 'batch_id' => $s->batch_id, 'academic_year_id' => $s->academic_year_id, 'name' => $s->name,
            'rule' => $s->rule, 'status' => 'draft', 'version' => $next, 'created_by' => $request->user()->id]);
        return response()->json(['success' => true, 'data' => $this->row($copy->load(['program:id,name', 'batch:id,name']))], 201);
    }

    public function tabulation(int $id, PdfService $pdf)
    {
        [$s, $subjects, $rows] = $this->table($id);
        $paper = count($subjects) > 8 ? 'a3' : 'a4';
        return response($pdf->render('pdf.tabulation', ['sheet' => $s, 'subjects' => $subjects, 'rows' => $rows], $paper, 'landscape'), 200,
            ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="tabulation-' . $s->id . '.pdf"']);
    }

    public function export(int $id)
    {
        [$s, $subjects, $rows] = $this->table($id);
        $head = array_merge([__('pdf.tabulation.roll'), __('pdf.tabulation.id'), __('pdf.tabulation.name')],
            array_merge(...array_map(fn ($b) => ["$b — " . __('pdf.tabulation.weighted'), "$b — " . __('pdf.tabulation.grade')], array_values($subjects))),
            [__('pdf.tabulation.total'), 'GPA', __('pdf.tabulation.position'), __('pdf.tabulation.result')]);
        $data = array_map(fn ($r) => array_merge([$r['roll'], $r['code'], $r['name']],
            array_merge(...array_map(fn ($sid) => [$r['subjects'][$sid]['weighted'] ?? '', $r['subjects'][$sid]['grade'] ?? ''], array_keys($subjects))),
            [$r['total'], $r['gpa'], $r['position'] ?? '—', $r['is_pass'] ? __('pdf.tabulation.passed') : __('pdf.tabulation.failed')]), $rows);
        return Excel::download(new SimpleSheetExport($head, $data, 'Tabulation'), "tabulation-{$s->id}.xlsx");
    }

    /** GET /student/final-results */
    public function forStudent(Request $request, DueBlockService $blocks)
    {
        return $this->mine(Student::with('user:id,name')->where('user_id', $request->user()->id)->firstOrFail(), $blocks);
    }

    /** GET /parent/children/{id}/final-results */
    public function forParent(Request $request, int $id, DueBlockService $blocks)
    {
        return $this->mine(Student::with('user:id,name')->whereKey($id)->whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->firstOrFail(), $blocks);
    }

    private function mine(Student $student, DueBlockService $blocks)
    {
        $head = ['id' => $student->id, 'name' => $student->user?->name, 'code' => $student->student_id];
        if ($b = $blocks->isBlocked($student, 'result')) return response()->json(['success' => true, 'data' => ['student' => $head, 'results' => [], 'blocked' => $b]]);
        $rows = FinalResult::with('student.user:id,name')->where('student_id', $student->id)
            ->whereIn('result_sheet_id', ResultSheet::where('status', 'published')->select('id'))->get();
        $sheets = ResultSheet::whereIn('id', $rows->pluck('result_sheet_id'))->get()->keyBy('id');
        return response()->json(['success' => true, 'data' => ['student' => $head, 'results' => $rows->sortByDesc('result_sheet_id')->map(fn ($r) => ['sheet' => ['id' => $r->result_sheet_id,
            'name' => $sheets[$r->result_sheet_id]->name ?? null, 'version' => $sheets[$r->result_sheet_id]->version ?? null]] + $this->result($r))->values()]]);
    }

    /** [sheet, subject id => name, rows by roll] */
    private function table(int $id): array
    {
        $s = ResultSheet::with(['program:id,name', 'batch:id,name'])->findOrFail($id);
        $results = FinalResult::with(['student.user:id,name', 'student.primaryEnrollment'])->where('result_sheet_id', $s->id)->get();
        $subjects = [];
        foreach ($results as $r) foreach ($r->details as $d) $subjects[$d['subject_id']] = $d['subject'];
        ksort($subjects);
        $rows = $results->map(fn ($r) => ['roll' => $r->student?->primaryEnrollment?->roll_no, 'code' => $r->student?->student_id, 'name' => $r->student?->user?->name,
            'subjects' => collect($r->details)->keyBy('subject_id')->all(), 'total' => $r->total_percentage, 'gpa' => $r->gpa, 'grade' => $r->grade,
            'position' => $r->position_program, 'is_pass' => $r->is_pass])->sortBy(fn ($r) => [$r['roll'] === null ? 1 : 0, $r['roll'] ?? 0, $r['name']])->values()->all();
        return [$s, $subjects, $rows];
    }

    private function draft(int $id): ResultSheet
    {
        $s = ResultSheet::findOrFail($id);
        if ($s->status === 'published') throw new BusinessException('published', 'result_sheet_published', 422);
        return $s;
    }

    private function row(ResultSheet $s): array
    {
        return ['id' => $s->id, 'name' => $s->name, 'program_id' => $s->program_id, 'program' => $s->program?->name, 'batch_id' => $s->batch_id, 'batch' => $s->batch?->name,
            'academic_year_id' => $s->academic_year_id, 'rule' => $s->rule, 'status' => $s->status, 'version' => $s->version,
            'published_at' => $s->published_at?->toIso8601String(), 'results_count' => $s->results_count ?? null];
    }

    private function result(FinalResult $r): array
    {
        return ['student_id' => $r->student_id, 'name' => $r->student?->user?->name, 'total_percentage' => $r->total_percentage, 'gpa' => $r->gpa, 'grade' => $r->grade,
            'position_program' => $r->position_program, 'position_batch' => $r->position_batch, 'is_pass' => $r->is_pass, 'details' => $r->details];
    }
}
