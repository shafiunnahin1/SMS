<?php

namespace App\Http\Controllers\Exams;

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
        return response()->json(['success' => true, 'data' => $this->exams->subjectsOf(Exam::findOrFail($id))->map(fn ($es) => $this->subjectRow($es))]);
    }

    public function updateSubjects(int $id)
    {
        $exam = Exam::findOrFail($id);
        $rows = $this->exams->updateSubjects($exam, app(ExamSubjectsRequest::class)->validated()['subjects']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $rows->map(fn ($es) => $this->subjectRow($es))]);
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
