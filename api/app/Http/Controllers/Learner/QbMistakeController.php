<?php

namespace App\Http\Controllers\Learner;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Http\Controllers\QuestionBank\QbStudentController;
use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{QbChapter, QbPracticeAttempt, QbQuestion, QbQuestionOption, QbQuizAttempt, QbSubject, User};
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * D238 MST.1: "my mistakes" - derived (no table) from the student's own submitted practice rounds and quiz attempts. A question is on
 * the list while its LATEST answered try was wrong; an unanswered question is not a mistake. Only questions the student may open now
 * (bought / in a valid pack, as practice). The list never shows the right answer. "Practise my mistakes" starts a normal practice
 * round (D165 ST.4, submitted through the usual practice route) from the list's MCQ questions. Only the student sees their own list.
 */
class QbMistakeController extends Controller
{
    public function __construct(private QbStudentController $student) {}

    /** GET /student/qb/mistakes?qb_subject_id=&qb_chapter_id= */
    public function index(Request $request)
    {
        $f = $this->filters($request);
        $list = $this->mistakes($request->user(), $f);
        $questions = QbQuestion::whereIn('id', $list->keys())->get()->keyBy('id');
        $subjects = QbSubject::whereIn('id', $questions->pluck('qb_subject_id')->filter()->unique())->get(['id', 'name_bn', 'name_en'])->keyBy('id');
        $chapters = QbChapter::whereIn('id', $questions->pluck('qb_chapter_id')->filter()->unique())->get(['id', 'name_bn', 'name_en'])->keyBy('id');
        $rows = $list->filter(fn ($m, $id) => $questions->has($id))->map(fn ($m, $id) => [
            'question' => QbQuestionPublicResource::make($questions[$id], false),
            'subject' => $subjects->get($questions[$id]->qb_subject_id)?->only(['id', 'name_bn', 'name_en']), 'chapter' => $chapters->get($questions[$id]->qb_chapter_id)?->only(['id', 'name_bn', 'name_en']),
            'your_answer' => $m['given'], 'times_wrong' => $m['wrong'], 'last_wrong_at' => $m['at'], 'can_practise' => $m['mcq'],
        ])->sortByDesc('last_wrong_at')->values();
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** POST /student/qb/mistakes/practice {qb_subject_id, qb_chapter_id?, count?} - a practice round from the list */
    public function practice(Request $request)
    {
        $f = $request->validate(['qb_subject_id' => 'required|integer|exists:qb_subjects,id', 'qb_chapter_id' => 'nullable|integer|exists:qb_chapters,id',
            'count' => 'nullable|integer|min:1|max:' . QbPracticeController::MAX]);
        $user = $request->user();
        $ids = $this->mistakes($user, $f)->filter(fn ($m) => $m['mcq'])->keys()->map(fn ($v) => (int) $v)->all();
        if (!$ids) throw new BusinessException(__('errors.mistakes_none'), 'mistakes_none', 422);
        shuffle($ids);
        $ids = array_slice($ids, 0, $f['count'] ?? 10);
        $attempt = QbPracticeAttempt::create(['student_user_id' => $user->id, 'qb_subject_id' => $f['qb_subject_id'], 'qb_chapter_id' => $f['qb_chapter_id'] ?? null,
            'question_ids' => $ids, 'total' => count($ids)]);
        $questions = QbQuestion::whereIn('id', $ids)->get()->sortBy(fn ($q) => array_search($q->id, $ids, true))->values();
        return response()->json(['success' => true, 'data' => ['id' => $attempt->id, 'questions' => $questions->map(fn ($q) => QbQuestionPublicResource::make($q, false))]], 201);
    }

    // ---- helpers ----

    private function filters(Request $request): array
    {
        return $request->validate(['qb_subject_id' => 'nullable|integer', 'qb_chapter_id' => 'nullable|integer']);
    }

    /** question id => [wrong (times), given (latest wrong answer), at (latest wrong, ISO), mcq (may go into a practice round)] */
    private function mistakes(User $user, array $f): Collection
    {
        $tries = collect();   // [question id, time, right?, given]
        QbPracticeAttempt::where('student_user_id', $user->id)->whereNotNull('submitted_at')->get(['question_ids', 'answers', 'submitted_at'])->each(function ($a) use ($tries) {
            $ids = array_map('intval', $a->question_ids ?? []);
            $right = QbQuestionOption::whereIn('qb_question_id', $ids)->where('is_correct', true)->get(['qb_question_id', 'label'])->groupBy('qb_question_id')
                ->map(fn ($g) => $g->pluck('label')->map(fn ($l) => (string) $l)->all());
            foreach ($ids as $q) {
                $given = $a->answers[$q] ?? $a->answers[(string) $q] ?? null;
                if (!self::answered($given)) continue;
                $tries->push([$q, $a->submitted_at, in_array((string) $given, $right[$q] ?? [], true), $given]);
            }
        });
        QbQuizAttempt::where('student_user_id', $user->id)->whereNotNull('submitted_at')->get(['answers', 'submitted_at'])->each(function ($a) use ($tries) {
            $data = $a->answers ?? [];
            foreach ($data['marks'] ?? [] as $q => $m) {
                $given = $data['given'][(string) $q] ?? null;
                if (!self::answered($given)) continue;
                $tries->push([(int) $q, $a->submitted_at, (bool) ($m['correct'] ?? false), $given]);
            }
        });
        $out = $tries->groupBy(0)->map(function ($g) {
            $g = $g->sortBy(fn ($t) => $t[1]->getTimestamp())->values();
            $last = $g->last();
            if ($last[2]) return null;   // the latest try was right: off the list
            return ['wrong' => $g->where(2, false)->count(), 'given' => $last[3], 'at' => $last[1]->toIso8601String()];
        })->filter();
        if ($out->isEmpty()) return $out;
        $meta = QbQuestion::whereIn('id', $out->keys())
            ->when($f['qb_subject_id'] ?? null, fn ($q, $v) => $q->where('qb_subject_id', $v))->when($f['qb_chapter_id'] ?? null, fn ($q, $v) => $q->where('qb_chapter_id', $v))
            ->pluck('id')->map(fn ($v) => (int) $v)->all();
        $open = $this->student->owned($user, 'question', $meta);
        $mcq = QbQuestionOption::whereIn('qb_question_id', $open)->where('is_correct', true)->distinct()->pluck('qb_question_id')->map(fn ($v) => (int) $v)->all();
        return $out->only($open)->map(fn ($m, $id) => $m + ['mcq' => in_array((int) $id, $mcq, true)]);
    }

    private static function answered(mixed $v): bool
    {
        if ($v === null) return false;
        if (is_array($v)) return collect($v)->contains(fn ($x) => self::answered($x));
        return trim((string) $v) !== '';
    }
}
