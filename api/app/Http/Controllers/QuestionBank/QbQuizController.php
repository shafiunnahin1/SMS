<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, QbQuestion, QbQuiz, QbQuizPackage, QbQuizQuestion};
use App\Services\QbQuizMarker;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// QB.10 (D66, docs/modules/question-bank.md §3ছ): the Super Admin's quiz packages and quizzes on the central host. A package has a
// validity (days from the purchase) and its price is the student price list's `quiz_package` row (QB.6 page). A quiz is `package`
// (open while the student's package access lasts), `free` (every student) or `public` (also on the platform's public page without
// login). A `fixed` quiz lists its questions - published, auto-marked types only; `random_from_scope` draws `question_count` of them
// from its subject / chapter / topic when a student starts. Nothing is deleted: a quiz or package is switched off.
class QbQuizController extends Controller
{
    /** GET /super/qb/quiz-packages */
    public function packages()
    {
        $counts = QbQuiz::whereNotNull('qb_quiz_package_id')->selectRaw('qb_quiz_package_id, count(*) n')->groupBy('qb_quiz_package_id')->pluck('n', 'qb_quiz_package_id');
        return response()->json(['success' => true, 'data' => QbQuizPackage::orderByDesc('is_active')->orderByDesc('id')->limit(500)->get()
            ->map(fn ($p) => $p->toArray() + ['quiz_count' => (int) ($counts[$p->id] ?? 0)])]);
    }

    /** POST /super/qb/quiz-packages */
    public function storePackage(Request $request)
    {
        $p = QbQuizPackage::create($this->packageFields($request));
        AuditLog::record('qb.quiz_package.created', $p, $p->only(['title', 'validity_days']));
        return response()->json(['success' => true, 'data' => $p->fresh(), 'message' => __('messages.saved')], 201);
    }

    /** PUT /super/qb/quiz-packages/{id} */
    public function updatePackage(Request $request, int $id)
    {
        $p = QbQuizPackage::findOrFail($id);
        $p->update($this->packageFields($request));
        AuditLog::record('qb.quiz_package.updated', $p, $p->only(['title', 'validity_days', 'is_active']));
        return response()->json(['success' => true, 'data' => $p->fresh(), 'message' => __('messages.saved')]);
    }

    /** GET /super/qb/quizzes?qb_quiz_package_id=&access= */
    public function index(Request $request)
    {
        $f = $request->validate(['qb_quiz_package_id' => 'nullable|integer', 'access' => 'nullable|in:package,free,public']);
        $rows = QbQuiz::when($f['qb_quiz_package_id'] ?? null, fn ($q, $v) => $q->where('qb_quiz_package_id', $v))
            ->when($f['access'] ?? null, fn ($q, $v) => $q->where('access', $v))
            ->orderByDesc('is_active')->orderByDesc('id')->limit(500)->get();
        return response()->json(['success' => true, 'data' => $rows]);
    }

    /** GET /super/qb/quizzes/{id}: with the fixed questions (ids and texts) */
    public function show(int $id)
    {
        $quiz = QbQuiz::findOrFail($id);
        return response()->json(['success' => true, 'data' => $this->shape($quiz)]);
    }

    /** POST /super/qb/quizzes */
    public function store(Request $request)
    {
        $quiz = DB::transaction(function () use ($request) {
            [$fields, $ids] = $this->quizFields($request);
            $quiz = QbQuiz::create($fields);
            $this->syncQuestions($quiz, $ids);
            return $quiz;
        });
        AuditLog::record('qb.quiz.created', $quiz, $quiz->only(['title', 'access', 'rule', 'question_count']));
        return response()->json(['success' => true, 'data' => $this->shape($quiz->fresh()), 'message' => __('messages.saved')], 201);
    }

    /** PUT /super/qb/quizzes/{id} */
    public function update(Request $request, int $id)
    {
        $quiz = QbQuiz::findOrFail($id);
        DB::transaction(function () use ($request, $quiz) {
            [$fields, $ids] = $this->quizFields($request);
            $quiz->update($fields);
            $this->syncQuestions($quiz, $ids);
        });
        AuditLog::record('qb.quiz.updated', $quiz, $quiz->only(['title', 'access', 'rule', 'question_count', 'is_active']));
        return response()->json(['success' => true, 'data' => $this->shape($quiz->fresh()), 'message' => __('messages.saved')]);
    }

    private function packageFields(Request $request): array
    {
        return $request->validate([
            'title' => 'required|string|max:200',
            'qb_class_level_id' => 'nullable|integer|exists:qb_class_levels,id',
            'qb_subject_id' => 'nullable|integer|exists:qb_subjects,id',
            'description' => 'nullable|string|max:1000',
            'validity_days' => 'required|integer|min:1|max:3650',
            'is_active' => 'sometimes|boolean',
        ]);
    }

    /** [quiz fields, fixed question ids] - the question count of a fixed quiz is its list's length */
    private function quizFields(Request $request): array
    {
        $f = $request->validate([
            'title' => 'required|string|max:200',
            'access' => 'required|in:package,free,public',
            'qb_quiz_package_id' => 'nullable|required_if:access,package|prohibited_unless:access,package|integer|exists:qb_quiz_packages,id',
            'qb_subject_id' => 'nullable|integer|exists:qb_subjects,id',
            'qb_chapter_id' => 'nullable|integer|exists:qb_chapters,id',
            'qb_topic_id' => 'nullable|integer|exists:qb_topics,id',
            'duration_minutes' => 'required|integer|min:1|max:600',
            'rule' => 'required|in:fixed,random_from_scope',
            'question_count' => 'required_if:rule,random_from_scope|nullable|integer|min:1|max:200',
            'question_ids' => 'required_if:rule,fixed|prohibited_unless:rule,fixed|array|max:200',
            'question_ids.*' => 'integer|distinct',
            'pass_mark' => 'nullable|numeric|min:0|max:9999',
            'opens_at' => 'nullable|date',
            'closes_at' => 'nullable|date|after:opens_at',
            'is_active' => 'sometimes|boolean',
        ]);
        $ids = array_values(array_map('intval', $f['question_ids'] ?? []));
        if ($f['rule'] === 'fixed') {
            $found = QbQuestion::where('status', 'published')->whereIn('id', $ids)->get();
            $bad = array_values(array_diff($ids, $found->filter(fn ($q) => QbQuizMarker::markable($q))->pluck('id')->all()));
            if ($ids === [] || $bad) throw ValidationException::withMessages(['question_ids' => __('errors.qb_quiz_questions', ['ids' => implode(', ', $bad)])]);
            $f['question_count'] = count($ids);
        } elseif (empty($f['qb_subject_id']) && empty($f['qb_chapter_id']) && empty($f['qb_topic_id'])) {
            throw ValidationException::withMessages(['qb_subject_id' => __('errors.qb_quiz_scope')]);
        }
        unset($f['question_ids']);
        return [$f + ['qb_quiz_package_id' => null], $f['rule'] === 'fixed' ? $ids : []];
    }

    private function syncQuestions(QbQuiz $quiz, array $ids): void
    {
        QbQuizQuestion::where('qb_quiz_id', $quiz->id)->delete();      // the quiz's own list (catalogue, not a financial row)
        foreach ($ids as $i => $qid) QbQuizQuestion::create(['qb_quiz_id' => $quiz->id, 'qb_question_id' => $qid, 'sort_order' => $i]);
    }

    private function shape(QbQuiz $quiz): array
    {
        $ids = QbQuizQuestion::where('qb_quiz_id', $quiz->id)->orderBy('sort_order')->pluck('qb_question_id')->all();
        $texts = QbQuestion::whereIn('id', $ids)->pluck('question_text', 'id');
        return $quiz->toArray() + ['questions' => array_map(fn ($id) => ['id' => $id, 'question_text' => $texts[$id] ?? null], $ids)];
    }
}
