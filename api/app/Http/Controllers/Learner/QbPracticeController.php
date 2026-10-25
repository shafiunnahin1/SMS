<?php

namespace App\Http\Controllers\Learner;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Controllers\QuestionBank\QbStudentController;
use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{QbPracticeAttempt, QbQuestion, QbQuestionOption};
use Illuminate\Http\Request;

/**
 * D165 ST.4: practice rounds. A round draws MCQ questions of a subject (or one chapter) from those the student may open now (bought
 * one by one, in a valid pack); the questions go out without their answers, the server marks the choices once, and only then
 * shows the right answer and the explanation. The summary per subject / chapter is the student's own.
 */
class QbPracticeController extends Controller
{
    public const MAX = 30;

    public function __construct(private QbStudentController $student) {}

    /** POST /student/qb/practice {qb_subject_id, qb_chapter_id?, count?} */
    public function start(Request $request)
    {
        $f = $request->validate(['qb_subject_id' => 'required|integer|exists:qb_subjects,id', 'qb_chapter_id' => 'nullable|integer|exists:qb_chapters,id',
            'count' => 'nullable|integer|min:1|max:' . self::MAX]);
        $user = $request->user();
        $candidates = QbQuestion::where('qb_subject_id', $f['qb_subject_id'])->when($f['qb_chapter_id'] ?? null, fn ($q, $v) => $q->where('qb_chapter_id', $v))
            ->whereIn('id', QbQuestionOption::where('is_correct', true)->select('qb_question_id'))->orderByDesc('id')->limit(500)->pluck('id')->map(fn ($v) => (int) $v)->all();
        $open = $this->student->owned($user, 'question', $candidates);
        if (!$open) throw new BusinessException(__('errors.practice_nothing_open'), 'practice_nothing_open', 422);
        shuffle($open);
        $ids = array_slice($open, 0, $f['count'] ?? 10);
        $attempt = QbPracticeAttempt::create(['student_user_id' => $user->id, 'qb_subject_id' => $f['qb_subject_id'], 'qb_chapter_id' => $f['qb_chapter_id'] ?? null,
            'question_ids' => $ids, 'total' => count($ids)]);
        $questions = QbQuestion::whereIn('id', $ids)->get()->sortBy(fn ($q) => array_search($q->id, $ids, true))->values();
        return response()->json(['success' => true, 'data' => ['id' => $attempt->id, 'questions' => $questions->map(fn ($q) => QbQuestionPublicResource::make($q, false))]], 201);
    }

    /** POST /student/qb/practice/{id}/submit {answers: {question id: label}} - once */
    public function submit(Request $request, int $id)
    {
        $f = $request->validate(['answers' => 'present|array', 'answers.*' => 'nullable|string|max:5']);
        $attempt = QbPracticeAttempt::where('student_user_id', $request->user()->id)->findOrFail($id);
        if ($attempt->submitted_at) throw new BusinessException(__('errors.practice_submitted'), 'practice_submitted', 422);
        $ids = array_map('intval', $attempt->question_ids);
        $right = QbQuestionOption::whereIn('qb_question_id', $ids)->where('is_correct', true)->get(['qb_question_id', 'label'])->groupBy('qb_question_id')
            ->map(fn ($g) => $g->pluck('label')->all());
        $answers = collect($ids)->mapWithKeys(fn ($q) => [$q => isset($f['answers'][$q]) ? (string) $f['answers'][$q] : null])->all();
        $marks = collect($ids)->mapWithKeys(fn ($q) => [$q => $answers[$q] !== null && in_array($answers[$q], $right[$q] ?? [], true)]);
        $attempt->update(['answers' => $answers, 'correct' => $marks->filter()->count(), 'submitted_at' => now()]);
        $open = $this->student->owned($request->user(), 'question', $ids);
        $questions = QbQuestion::whereIn('id', $ids)->get()->keyBy('id');
        return response()->json(['success' => true, 'data' => ['id' => $attempt->id, 'total' => $attempt->total, 'correct' => $attempt->correct,
            'results' => collect($ids)->map(fn ($q) => ['question_id' => $q, 'chosen' => $answers[$q], 'is_right' => $marks[$q],
                'question' => isset($questions[$q]) ? QbQuestionPublicResource::make($questions[$q], in_array($q, $open, true)) : null])->values()]]);
    }

    /** GET /student/qb/practice: the student's own rounds summed per subject and chapter, and the latest rounds */
    public function stats(Request $request)
    {
        $rows = QbPracticeAttempt::where('student_user_id', $request->user()->id)->whereNotNull('submitted_at')->get();
        $by = $rows->groupBy(fn ($a) => $a->qb_subject_id . ':' . ($a->qb_chapter_id ?? 0))->map(fn ($g) => [
            'qb_subject_id' => $g->first()->qb_subject_id, 'qb_chapter_id' => $g->first()->qb_chapter_id, 'rounds' => $g->count(),
            'total' => $g->sum('total'), 'correct' => $g->sum('correct'), 'percent' => $g->sum('total') ? round(100 * $g->sum('correct') / $g->sum('total'), 1) : 0])->values();
        return response()->json(['success' => true, 'data' => ['summary' => $by, 'latest' => $rows->sortByDesc('id')->take(10)
            ->map(fn ($a) => $a->only(['id', 'qb_subject_id', 'qb_chapter_id', 'total', 'correct']) + ['submitted_at' => $a->submitted_at?->toIso8601String()])->values()]]);
    }
}
