<?php

namespace App\Services\Ai;

use App\Http\Resources\QbQuestionPublicResource;
use App\Jobs\RephraseAnswerJob;
use App\Models\{AiAnswerBank, AiAnswerReveal, AiConversation, AiMessage, AiReview, PlatformSetting, QbConcept, QbCreativePart, QbCurriculumNode, QbQuestion, QbQuestionOption, QbResource, QbQuizAttempt, QbQuizQuestion, QbUnlock, User};
use App\Services\QbPricingService;
use App\Services\QbQuestionFinderService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

/**
 * D164 (2) AI-P1.2: answers a teacher's question from SMS's own data, without a language model. The text is normalized the way the
 * question finder does it and searched with MySQL FULLTEXT (n-gram) in (a) the reviewed answer bank - a close match is returned
 * directly - (b) the whole platform's published question bank and (c) the curriculum; otherwise an answer is composed from the
 * best matches with fixed Bangla templates, each part with its source. Questions leave only through QbQuestionPublicResource: the
 * answer of an item the institution has not unlocked (and that is not free) is shown only within the daily free quota, counted
 * here on the server (one reveal per question per institution per day); after that it stays hidden. Every answer is queued for
 * review (D164 (3)).
 */
class AssistantService
{
    public const DIRECT_SCORE = 80.0;         // the finder's "high" match: a reviewed answer is given as it is
    public const MAX_QUESTIONS = 5;
    public const MAX_NODES = 3;
    public const QUOTA_KEY = 'ai_free_answers_per_day';
    public const QUOTA_DEFAULT = 20;
    public const LIMIT_KEY = 'ai_daily_question_limit';   // AI-P1.5: questions per institution per day; null = no limit (D164 owner answer 4)
    public const STUDENT_QUOTA_KEY = 'ai_student_free_answers_per_day';   // D165 (4) ST.6: per student, not per institution
    public const STUDENT_QUOTA_DEFAULT = 20;

    /** D165 ST.6: the asker - a student is counted alone, opens what they bought, and never sees a running quiz's answers */
    private ?User $user = null;

    public function __construct(private QbPricingService $pricing) {}

    private function student(): bool
    {
        return $this->user?->role === 'student';
    }

    public function ask(AiConversation $conversation, string $text, User $user): array
    {
        $this->user = $user;
        $limit = PlatformSetting::read(self::LIMIT_KEY);
        $asked = AiMessage::where('role', 'question')->where('created_at', '>=', today())
            ->when($this->student(), fn ($q) => $q->whereHas('conversation', fn ($c) => $c->where('user_id', $user->id)));   // a student: their own questions
        if ($limit !== null && $limit !== '' && $asked->count() >= (int) $limit) {
            throw new \App\Exceptions\BusinessException('the daily question limit is reached', 'ai_daily_limit', 422, ['limit' => (int) $limit]);
        }
        return DB::transaction(function () use ($conversation, $text, $user) {
            $question = AiMessage::create(['ai_conversation_id' => $conversation->id, 'role' => 'question', 'body' => $text]);
            $norm = QbQuestionFinderService::normalize($text);
            $answer = $this->help($norm, $user) ?? $this->fromBank($norm) ?? $this->composed($norm, $user);
            $msg = AiMessage::create(['ai_conversation_id' => $conversation->id, 'role' => 'answer', 'body' => $answer['body'], 'kind' => $answer['kind'], 'sources' => $answer['sources']]);
            foreach ($answer['reveal'] ?? [] as $qid) {
                AiAnswerReveal::firstOrCreate(['qb_question_id' => $qid, 'revealed_on' => today()->toDateString()] + ($this->student() ? ['user_id' => $user->id] : []),
                    ['user_id' => $user->id, 'ai_message_id' => $msg->id]);
            }
            if ($answer['kind'] !== 'help') AiReview::create(['ai_message_id' => $msg->id, 'status' => 'unreviewed']);   // D166 AI-Q4: a help article is already approved
            if ($answer['kind'] === 'composed' && AnswerRephraser::enabled()) {          // AI-P1.6: the template is shown now, the model's text later
                $msg->update(['model_version' => RephraseAnswerJob::PENDING]);
                RephraseAnswerJob::dispatch($msg->id, (int) Tenancy::current()->id)->afterCommit();
            }
            $conversation->touch();
            return ['question' => $question, 'answer' => $msg, 'questions' => $answer['questions'] ?? []];
        });
    }

    /**
     * D166 AI-Q4: the software help guide first - an approved article that fits the caller answers directly (kind "help", its article
     * as the only source, nothing counted); a workflow question with no fitting article, or any question from a role without
     * question-bank answers (parent, accountant, ...), gets the fixed "no verified information" reply instead of a guess
     */
    private function help(string $norm, User $user): ?array
    {
        $article = app(HelpService::class)->find($user, $norm);
        if ($article) return ['kind' => 'help', 'body' => HelpService::render($article), 'sources' => [['type' => 'help', 'id' => $article->id, 'title' => $article->title]]];
        $eduRole = in_array($user->role, HelpService::EDU_ROLES, true);
        if (!$eduRole || (HelpService::intent($norm) && !$this->questions($norm)->isNotEmpty())) {
            return ['kind' => 'not_found', 'body' => __('ai.help.not_found'), 'sources' => []];
        }
        return null;
    }

    /** reviewed answers open to all (NULL) or this institution's own; the closest by the finder's score, given directly at 80+ */
    private function fromBank(string $norm): ?array
    {
        if ($norm === '') return null;
        $rows = $this->bankCandidates($norm);
        $best = $rows->map(fn ($r) => ['r' => $r, 'score' => QbQuestionFinderService::score($norm, QbQuestionFinderService::normalize($r->question_text)) + $r->weight])
            ->sortByDesc('score')->first();
        if (!$best || $best['score'] < self::DIRECT_SCORE) return null;
        // AI-P1.4: a reviewed answer built from questions this institution has not unlocked may state their answers - it is given only
        // while the daily free quota covers those questions (each counted once a day), else the composed answer (with hiding) is used
        $qids = collect($best['r']->sources ?? [])->where('type', 'question')->pluck('id')->map(fn ($v) => (int) $v)->all();
        if (array_intersect($qids, $this->runningQuiz())) return null;                      // ST.6: never a running quiz's answer
        $locked = $qids ? array_values(array_diff($qids, $this->openIds(QbQuestion::whereIn('id', $qids)->get()))) : [];
        $toCount = array_values(array_filter($locked, fn ($id) => !$this->revealedToday($id)));
        if (count($toCount) > $this->quotaLeft()) return null;
        return ['kind' => 'direct', 'body' => $best['r']->answer_text, 'sources' => [['type' => 'answer_bank', 'id' => $best['r']->id]], 'reveal' => $toCount];
    }

    /** the answer-bank rows a text can reach: open to all (NULL) or this institution's own - the AI-P1.5 leak check uses it too */
    public function bankCandidates(string $norm)
    {
        $tenant = (int) Tenancy::current()->id;
        return AiAnswerBank::anyInstitution()->where(fn ($q) => $q->whereNull('institution_id')->orWhere('institution_id', $tenant))
            ->whereRaw('MATCH(question_text, answer_text) AGAINST (? IN NATURAL LANGUAGE MODE)', [$norm])->limit(20)->get();
    }

    private function composed(string $norm, User $user): array
    {
        // D166 AI-Q1: only exact / close matches; an exact match stands alone (no near questions, no curriculum); curriculum,
        // concepts and resources only when their own names fit the question; nothing that fits = a clear "not found"
        $questions = $norm === '' ? collect() : $this->questions($norm);
        $exact = $this->lastExact;
        $nodes = $norm === '' || $exact ? collect() : $this->nodes($norm);
        $concepts = $norm === '' || $exact ? collect() : $this->titled(QbConcept::class, ['title_bn', 'title_en'], $norm);
        $resources = $norm === '' || $exact ? collect() : $this->titled(QbResource::class, ['title_bn', 'title_en'], $norm);
        if ($questions->isEmpty() && $nodes->isEmpty() && $concepts->isEmpty() && $resources->isEmpty()) {
            return ['kind' => 'not_found', 'body' => __('ai.not_found'), 'sources' => []];
        }
        $plain = fn ($html) => RelevanceService::withoutTokens(trim(strip_tags((string) $html)), __('ai.figure'));

        $open = array_values(array_diff($this->openIds($questions), $blocked = $this->runningQuiz()));
        $left = $this->quotaLeft();
        $reveal = [];
        $shown = [];
        $lines = [];
        if ($questions->isNotEmpty()) $lines[] = __('ai.matches');
        foreach ($questions->values() as $i => $q) {
            $visible = in_array($q->id, $open, true);
            if (!$visible && !in_array($q->id, $blocked, true) && ($left > 0 || $this->revealedToday($q->id))) {
                if (!$this->revealedToday($q->id)) { $left--; $reveal[] = $q->id; }
                $visible = true;
            }
            $public = QbQuestionPublicResource::make($q, $visible);
            $shown[] = $public + ['free_reveal' => $visible && !in_array($q->id, $open, true)];
            $lines[] = ($i + 1) . '. ' . $plain($public['question_text']);
            foreach ($public['options'] as $o) $lines[] = '   ' . $o['label'] . ') ' . $plain($o['content_text']) . (!empty($o['is_correct']) ? ' ✓' : '');
            if ($visible) {
                if (!empty($public['answer_text'])) $lines[] = '   ' . __('ai.answer') . ': ' . $plain($public['answer_text']);
                if (!empty($public['explanation_text'])) $lines[] = '   ' . __('ai.explanation') . ': ' . $plain($public['explanation_text']);
            } else {
                $lines[] = '   ' . __('ai.locked');
            }
        }
        if ($nodes->isNotEmpty()) $lines[] = __('ai.chapters') . ': ' . $nodes->map(fn ($n) => $n->name_bn ?: $n->name_en)->implode(', ');
        if ($concepts->isNotEmpty()) $lines[] = __('ai.concepts') . ': ' . $concepts->map(fn ($c) => $c->title_bn ?: $c->title_en)->implode(', ');
        if ($resources->isNotEmpty()) $lines[] = __('ai.resources') . ': ' . $resources->map(fn ($r) => $r->title_bn ?: $r->title_en)->implode(', ');

        $sources = [...collect($shown)->map(fn ($q) => ['type' => 'question', 'id' => $q['id'], 'locked' => !$q['unlocked']])->all(),
            ...$nodes->map(fn ($n) => ['type' => 'curriculum', 'id' => $n->id, 'title' => $n->name_bn ?: $n->name_en])->all(),
            ...$concepts->map(fn ($c) => ['type' => 'concept', 'id' => $c->id, 'title' => $c->title_bn ?: $c->title_en])->all(),      // titles only: a concept's body stays paid
            ...$resources->map(fn ($r) => ['type' => 'resource', 'id' => $r->id, 'title' => $r->title_bn ?: $r->title_en])->all()];
        return ['kind' => 'composed', 'body' => implode("\n", $lines), 'sources' => $sources, 'questions' => $shown, 'reveal' => $reveal];
    }

    /**
     * D166 AI-Q2: the questions an answer showed, rebuilt for the chat's safe renderer (maths, graphs, diagrams, pictures) through
     * QbQuestionPublicResource - each exactly as open as it was shown then (`locked` in the answer's sources), so a locked
     * question carries no answer, explanation, `is_correct` or answer-only picture; a question no longer published is skipped
     */
    public static function items(array $sources): array
    {
        $shown = collect($sources)->where('type', 'question')->keyBy(fn ($s) => (int) $s['id']);
        if ($shown->isEmpty()) return [];
        $rows = QbQuestion::where('status', 'published')->whereIn('id', $shown->keys())->get()->keyBy('id');
        return $shown->filter(fn ($s, $id) => isset($rows[$id]))->map(function ($s, $id) use ($rows) {
            $p = QbQuestionPublicResource::make($rows[$id], empty($s['locked']));
            return ['id' => $id, 'unlocked' => $p['unlocked'], 'question_text' => $p['question_text'], 'media' => $p['media'],
                'options' => array_map(fn ($o) => array_intersect_key($o, array_flip(['label', 'content_text', 'is_correct'])), $p['options']),
                'answer_text' => $p['answer_text'] ?? null, 'explanation_text' => $p['explanation_text'] ?? null];
        })->values()->all();
    }

    /** AI-P1.6 model comparison: the composed text an evaluation item would get - nothing saved, nothing counted */
    public function composedPreview(string $text, User $user): string
    {
        return $this->composed(QbQuestionFinderService::normalize($text), $user)['body'];
    }

    /** AI-P1.5 evaluation: the ids the composed answer would show for a text, best first - no answer, no reveal, nothing saved */
    public function rankedQuestionIds(string $text): array
    {
        $norm = QbQuestionFinderService::normalize($text);
        return $norm === '' ? [] : $this->questions($norm)->pluck('id')->map(fn ($v) => (int) $v)->all();
    }

    /** set by questions(): the best match was exact (then it stands alone) */
    private bool $lastExact = false;

    /** the platform's published questions whose text, explanation, options or creative parts match (FULLTEXT), classified by
     *  RelevanceService: exact ones alone if any, else close ones by score; weak ones never; at most 5 */
    private function questions(string $norm)
    {
        $this->lastExact = false;
        $ids = QbQuestion::where('status', 'published')->whereRaw('MATCH(question_text, explanation_text) AGAINST (? IN NATURAL LANGUAGE MODE)', [$norm])->limit(30)->pluck('id')
            ->merge(QbQuestionOption::whereRaw('MATCH(content_text) AGAINST (? IN NATURAL LANGUAGE MODE)', [$norm])->limit(30)->pluck('qb_question_id'))
            ->merge(QbCreativePart::whereRaw('MATCH(question_text) AGAINST (? IN NATURAL LANGUAGE MODE)', [$norm])->limit(30)->pluck('qb_question_id'))
            ->unique()->values();
        if ($ids->isEmpty()) return collect();
        $options = QbQuestionOption::whereIn('qb_question_id', $ids)->get(['qb_question_id', 'content_text'])->groupBy('qb_question_id');
        $parts = QbCreativePart::whereIn('qb_question_id', $ids)->get(['qb_question_id', 'question_text'])->groupBy('qb_question_id');
        $rated = QbQuestion::where('status', 'published')->whereIn('id', $ids)->get()->map(function ($q) use ($norm, $options, $parts) {
            $extra = collect($options[$q->id] ?? [])->pluck('content_text')->merge(collect($parts[$q->id] ?? [])->pluck('question_text'))->push($q->explanation_text)->implode(' ');
            return ['q' => $q] + RelevanceService::classify($norm, QbQuestionFinderService::normalize((string) $q->question_text), QbQuestionFinderService::normalize((string) $extra));
        });
        $exact = $rated->where('class', RelevanceService::EXACT);
        $this->lastExact = $exact->isNotEmpty();
        $keep = $this->lastExact ? $exact : $rated->where('class', RelevanceService::CLOSE);
        return $keep->sortByDesc(fn ($r) => [$r['coverage'], $r['score']])->take(self::MAX_QUESTIONS)->pluck('q')->values();
    }

    /** chapters / topics whose own name fits the question (FULLTEXT finds candidates, RelevanceService keeps the fitting ones) */
    private function nodes(string $norm)
    {
        return QbCurriculumNode::whereRaw('MATCH(name_bn, name_en) AGAINST (? IN NATURAL LANGUAGE MODE)', [$norm])->limit(20)->get(['id', 'name_bn', 'name_en'])
            ->filter(fn ($n) => RelevanceService::nameRelevant($norm, QbQuestionFinderService::normalize((string) $n->name_bn)) || RelevanceService::nameRelevant($norm, QbQuestionFinderService::normalize((string) $n->name_en)))->take(self::MAX_NODES)->values();
    }

    /** published concepts / resources whose title fits the question - titles only (no body, no file) */
    private function titled(string $model, array $cols, string $norm)
    {
        $terms = collect(RelevanceService::terms($norm))->filter(fn ($t) => mb_strlen($t) >= 3)->sortByDesc(fn ($t) => mb_strlen($t))->take(3)->values();
        if ($terms->isEmpty()) return collect();
        return $model::where(fn ($w) => $terms->each(fn ($t) => collect($cols)->each(fn ($c) => $w->orWhere($c, 'like', '%' . addcslashes($t, '%_\\') . '%'))))
            ->limit(20)->get(['id', ...$cols])
            ->filter(fn ($x) => collect([$x->title_bn, $x->title_en])->contains(fn ($t) => RelevanceService::coverage(RelevanceService::terms($norm), QbQuestionFinderService::normalize((string) $t)) >= 0.6))
            ->take(3)->values();
    }

    /** unlocked by the institution, or free for it now (a free price rule); ST.6: a student's own purchases and student-free items */
    private function openIds($questions): array
    {
        $ids = $questions->pluck('id')->all();
        if ($this->student()) {
            $controller = app(\App\Http\Controllers\QuestionBank\QbStudentController::class);
            $open = $ids ? $controller->owned($this->user, 'question', $ids) : [];
            foreach ($questions as $q) {
                if (!in_array($q->id, $open, true) && ($controller->quote($this->user, 'question', $q)['price'] ?? null) === '0.00') $open[] = (int) $q->id;
            }
            return $open;
        }
        $open = QbUnlock::where('item_type', 'question')->whereIn('item_id', $ids)->pluck('item_id')->map(fn ($v) => (int) $v)->all();
        foreach ($questions as $q) {
            if (!in_array($q->id, $open, true) && ($this->pricing->quote('institution', 'question', $q)['price'] ?? null) === '0.00') $open[] = (int) $q->id;
        }
        return $open;
    }

    public function quotaLeft(?User $user = null): int
    {
        if ($user) $this->user = $user;
        if ($this->student()) {
            $limit = (int) (PlatformSetting::read(self::STUDENT_QUOTA_KEY, self::STUDENT_QUOTA_DEFAULT) ?? self::STUDENT_QUOTA_DEFAULT);
            return max(0, $limit - AiAnswerReveal::where('user_id', $this->user->id)->where('revealed_on', today()->toDateString())->count());
        }
        $limit = (int) (PlatformSetting::read(self::QUOTA_KEY, self::QUOTA_DEFAULT) ?? self::QUOTA_DEFAULT);
        return max(0, $limit - AiAnswerReveal::where('revealed_on', today()->toDateString())->distinct()->count('qb_question_id'));
    }

    private function revealedToday(int $questionId): bool
    {
        return AiAnswerReveal::where('qb_question_id', $questionId)->where('revealed_on', today()->toDateString())
            ->when($this->student(), fn ($q) => $q->where('user_id', $this->user->id))->exists();
    }

    /** ST.6: the questions of a quiz this student is taking right now (started, not submitted) - their answers stay hidden meanwhile */
    private function runningQuiz(): array
    {
        if (!$this->student()) return [];
        $quizzes = QbQuizAttempt::where('student_user_id', $this->user->id)->whereNull('submitted_at')->pluck('qb_quiz_id');
        return $quizzes->isEmpty() ? [] : QbQuizQuestion::whereIn('qb_quiz_id', $quizzes)->pluck('qb_question_id')->map(fn ($v) => (int) $v)->unique()->values()->all();
    }
}
