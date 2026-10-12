<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Models\{QbQuestion, QbQuiz};
use App\Services\QbQuizService;
use Illuminate\Http\Request;

// QB.10 (D66, docs/modules/question-bank.md §5 "পাবলিক পাতা"): the platform's public quizzes, no login, on the central host. The
// questions come without answers (the locked public shape, only published questions); `check` marks the answers on the server and
// gives the score and right / wrong per question - never the right answers (they are paid content; DECISIONS 2026-10-12 QB.10) - nothing is saved ("log in to keep your result"). A random quiz draws once per request,
// so `show` returns the drawn ids and `check` marks exactly those (only ids that belong to the quiz's scope).
class QbPublicQuizController extends Controller
{
    public function __construct(private QbQuizService $quizzes) {}

    /** GET /public/qb/quizzes */
    public function index()
    {
        $rows = QbQuiz::where('access', 'public')->where('is_active', true)->orderByDesc('id')->limit(200)->get()
            ->filter(fn ($q) => $this->quizzes->open($q))
            ->map(fn ($q) => $q->only(['id', 'title', 'qb_subject_id', 'duration_minutes', 'question_count', 'pass_mark']))->values();
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** GET /public/qb/quizzes/{id}: the questions without answers */
    public function show(int $id)
    {
        $quiz = $this->publicQuiz($id);
        $ids = $this->published($this->quizzes->draw($quiz));
        return response()->json(['success' => true, 'data' => $quiz->only(['id', 'title', 'duration_minutes', 'question_count', 'pass_mark'])
            + ['question_ids' => $ids, 'questions' => $this->quizzes->paper($ids)]]);
    }

    /** POST /public/qb/quizzes/{id}/check {question_ids, answers}: the score and right / wrong per question, not saved */
    public function check(Request $request, int $id)
    {
        $f = $request->validate(['question_ids' => 'required|array|min:1|max:200', 'question_ids.*' => 'integer|distinct', 'answers' => 'present|array|max:200']);
        $quiz = $this->publicQuiz($id);
        $ids = $this->published($this->allowed($quiz, array_map('intval', $f['question_ids'])));
        $given = $this->quizzes->clean($f['answers'], $ids);
        [$score, $total, $marks] = $this->quizzes->markAll($ids, $given);
        return response()->json(['success' => true, 'data' => ['score' => $score, 'total' => $total, 'saved' => false, 'marks' => (object) $marks]]);
    }

    private function publicQuiz(int $id): QbQuiz
    {
        $quiz = QbQuiz::where('access', 'public')->findOrFail($id);
        if (!$this->quizzes->open($quiz)) throw $this->quizzes->notOpen();
        return $quiz;
    }

    /** The asked ids that this quiz may contain: the fixed list, or questions inside the random quiz's scope; at most its count */
    private function allowed(QbQuiz $quiz, array $ids): array
    {
        if ($quiz->rule === 'fixed') return array_values(array_intersect($ids, $this->quizzes->draw($quiz)));
        $in = QbQuestion::whereIn('id', $ids)
            ->when($quiz->qb_topic_id, fn ($q, $v) => $q->where('qb_topic_id', $v))
            ->when($quiz->qb_chapter_id, fn ($q, $v) => $q->where('qb_chapter_id', $v))
            ->when($quiz->qb_subject_id, fn ($q, $v) => $q->where('qb_subject_id', $v))->pluck('id')->map(fn ($v) => (int) $v)->all();
        return array_slice(array_values(array_intersect($ids, $in)), 0, $quiz->question_count);
    }

    private function published(array $ids): array
    {
        $ok = QbQuestion::whereIn('id', $ids)->where('status', 'published')->pluck('id')->map(fn ($v) => (int) $v)->all();
        return array_values(array_intersect($ids, $ok));
    }
}
