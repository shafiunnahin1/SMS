<?php

namespace App\Http\Controllers\Exams;

use App\Services\Exams\ExamPaperService;
use App\Http\Controllers\Controller;
use App\Http\Requests\Exams\{ExamRequest, ExamSubjectsRequest};
use App\Http\Resources\ExamResource;
use App\Models\Exam;
use App\Services\ExamService;
use Illuminate\Http\Request;

// Step 4.5 (admin): exams of a program or a single batch; their subjects (schedule, full/pass marks, parts); publish
class ExamController extends Controller
{
    public function __construct(private ExamService $exams) {}

    public function index(Request $request)
    {
        $f = $request->validate(['program_id' => 'nullable|integer', 'academic_year' => 'nullable|integer', 'status' => 'nullable|in:upcoming,ongoing,completed,published']);
        $exams = Exam::with(['program:id,name', 'batch:id,name'])->withCount('subjects')->withExists('results')
            ->when($f['program_id'] ?? null, fn ($q, $v) => $q->where('program_id', $v))
            ->when($f['academic_year'] ?? null, fn ($q, $v) => $q->where('academic_year', $v))
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->orderByDesc('academic_year')->orderByDesc('id')->get();
        return ExamResource::collection($exams)->additional(['success' => true]);
    }

    public function store(ExamRequest $request)
    {
        $exam = $this->exams->create($request->validated());
        return (new ExamResource($this->load($exam)))->additional(['success' => true, 'message' => __('messages.saved')])->response()->setStatusCode(201);
    }

    public function show(int $id)
    {
        return (new ExamResource($this->load(Exam::findOrFail($id))))->additional(['success' => true]);
    }

    public function update(int $id)
    {
        $exam = Exam::findOrFail($id);                          // another tenant's id is a 404 before the input is checked
        $exam->update(app(ExamRequest::class)->validated());
        return (new ExamResource($this->load($exam)))->additional(['success' => true, 'message' => __('messages.saved')]);
    }

    public function destroy(int $id)
    {
        $this->exams->delete(Exam::findOrFail($id));
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    public function publish(int $id)
    {
        return (new ExamResource($this->load($this->exams->publish(Exam::findOrFail($id)))))->additional(['success' => true, 'message' => __('messages.saved')]);
    }

    public function subjects(int $id)
    {
        $exam = Exam::findOrFail($id);
        $links = app(ExamPaperService::class)->linksOf($exam);
        return response()->json(['success' => true, 'data' => $this->exams->subjectsOf($exam)->map(fn ($es) => $this->subjectRow($es) + ['papers' => $links[$es->subject_id] ?? []])]);
    }

    public function updateSubjects(int $id)
    {
        $exam = Exam::findOrFail($id);
        $rows = $this->exams->updateSubjects($exam, app(ExamSubjectsRequest::class)->validated()['subjects']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $rows->map(fn ($es) => $this->subjectRow($es))]);
    }

    /** D158 (3): link a final question paper to one exam subject (its mark parts follow the paper) */
    public function linkPaper(Request $request, int $id, int $subjectId, ExamPaperService $papers)
    {
        $exam = Exam::findOrFail($id);                                           // another institution's exam is 404 before any validation
        $data = $request->validate(['qb_paper_id' => 'required|integer', 'qb_subject_id' => 'nullable|integer']);   // D159 (1): one block of a multi-subject paper
        $papers->link($exam, $subjectId, (int) $data['qb_paper_id'], isset($data['qb_subject_id']) ? (int) $data['qb_subject_id'] : null, $request->user());
        return $this->subjects($id);
    }

    /** ?link_id= removes that one link (D159 (2): a subject may have several); without it every link of the subject */
    public function unlinkPaper(Request $request, int $id, int $subjectId, ExamPaperService $papers)
    {
        $exam = Exam::findOrFail($id);
        $linkId = $request->validate(['link_id' => 'nullable|integer'])['link_id'] ?? null;
        $papers->unlink($exam, $subjectId, $linkId ? (int) $linkId : null);
        return $this->subjects($id);
    }

    /** GET /exams/{id}/merit-list?batch_id= - rank, student, total, percentage; a tie shares the rank */
    public function meritList(Request $request, int $id)
    {
        $exam = Exam::findOrFail($id);
        $batchId = $request->validate(['batch_id' => 'nullable|integer'])['batch_id'] ?? null;
        return response()->json(['success' => true, 'data' => $this->exams->meritList($exam, $batchId ? (int) $batchId : null)]);
    }

    private function load(Exam $exam): Exam
    {
        return $exam->load(['program:id,name', 'batch:id,name'])->loadCount('subjects')->loadExists('results');
    }

    private function subjectRow($es): array
    {
        return ['subject_id' => $es->subject_id, 'name' => $es->subject?->name, 'is_optional' => (bool) $es->subject?->is_optional,
            'full_marks' => $es->full_marks, 'pass_marks' => $es->pass_marks, 'components' => $es->components,
            'exam_date' => $es->exam_date?->toDateString(), 'start_time' => $es->start_time ? substr($es->start_time, 0, 5) : null,
            'end_time' => $es->end_time ? substr($es->end_time, 0, 5) : null, 'room' => $es->room, 'sort_order' => $es->sort_order];
    }
}
