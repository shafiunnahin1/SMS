<?php

namespace App\Services\Ai;

use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{AiAnswerBank, AiAnswerReveal, AiConversation, AiMessage, AiReview, PlatformSetting, QbCurriculumNode, QbQuestion, QbQuestionOption, QbUnlock, User};
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
    public const MIN_SCORE = 25.0;            // below this a question is not shown as a match
    public const MAX_QUESTIONS = 5;
    public const MAX_NODES = 3;
    public const QUOTA_KEY = 'ai_free_answers_per_day';
    public const QUOTA_DEFAULT = 20;
    public const LIMIT_KEY = 'ai_daily_question_limit';   // AI-P1.5: questions per institution per day; null = no limit (D164 owner answer 4)

    public function __construct(private QbPricingService $pricing) {}

    public function ask(AiConversation $conversation, string $text, User $user): array
    {
        $limit = PlatformSetting::read(self::LIMIT_KEY);
        if ($limit !== null && $limit !== '' && AiMessage::where('role', 'question')->where('created_at', '>=', today())->count() >= (int) $limit) {
            throw new \App\Exceptions\BusinessException('the daily question limit is reached', 'ai_daily_limit', 422, ['limit' => (int) $limit]);
        }
        return DB::transaction(function () use ($conversation, $text, $user) {
            $question = AiMessage::create(['ai_conversation_id' => $conversation->id, 'role' => 'question', 'body' => $text]);
            $norm = QbQuestionFinderService::normalize($text);
            $answer = $this->fromBank($norm) ?? $this->composed($norm, $user);
            $msg = AiMessage::create(['ai_conversation_id' => $conversation->id, 'role' => 'answer', 'body' => $answer['body'], 'kind' => $answer['kind'], 'sources' => $answer['sources']]);
            foreach ($answer['reveal'] ?? [] as $qid) {
                AiAnswerReveal::firstOrCreate(['qb_question_id' => $qid, 'revealed_on' => today()->toDateString()], ['user_id' => $user->id, 'ai_message_id' => $msg->id]);
            }
            AiReview::create(['ai_message_id' => $msg->id, 'status' => 'unreviewed']);
            $conversation->touch();
            return ['question' => $question, 'answer' => $msg, 'questions' => $answer['questions'] ?? []];
        });
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
        $questions = $norm === '' ? collect() : $this->questions($norm);
        $nodes = $norm === '' ? collect() : QbCurriculumNode::whereRaw('MATCH(name_bn, name_en) AGAINST (? IN NATURAL LANGUAGE MODE)', [$norm])->limit(self::MAX_NODES)->get(['id', 'name_bn', 'name_en']);
        if ($questions->isEmpty() && $nodes->isEmpty()) {
            return ['kind' => 'not_found', 'body' => __('ai.not_found'), 'sources' => []];
        }

        $open = $this->openIds($questions);
        $left = $this->quotaLeft();
        $reveal = [];
        $shown = [];
        $lines = [];
        if ($questions->isNotEmpty()) $lines[] = __('ai.matches');
        foreach ($questions->values() as $i => $q) {
            $visible = in_array($q->id, $open, true);
            if (!$visible && ($left > 0 || $this->revealedToday($q->id))) {
                if (!$this->revealedToday($q->id)) { $left--; $reveal[] = $q->id; }
                $visible = true;
            }
            $public = QbQuestionPublicResource::make($q, $visible);
            $shown[] = $public + ['free_reveal' => $visible && !in_array($q->id, $open, true)];
            $lines[] = ($i + 1) . '. ' . trim(strip_tags((string) $public['question_text']));
            foreach ($public['options'] as $o) $lines[] = '   ' . $o['label'] . ') ' . trim(strip_tags((string) $o['content_text'])) . (!empty($o['is_correct']) ? ' ✓' : '');
            if ($visible) {
                if (!empty($public['answer_text'])) $lines[] = '   ' . __('ai.answer') . ': ' . trim(strip_tags($public['answer_text']));
                if (!empty($public['explanation_text'])) $lines[] = '   ' . __('ai.explanation') . ': ' . trim(strip_tags($public['explanation_text']));
            } else {
                $lines[] = '   ' . __('ai.locked');
            }
        }
        if ($nodes->isNotEmpty()) $lines[] = __('ai.chapters') . ': ' . $nodes->map(fn ($n) => $n->name_bn ?: $n->name_en)->implode(', ');

        $sources = [...collect($shown)->map(fn ($q) => ['type' => 'question', 'id' => $q['id'], 'locked' => !$q['unlocked']])->all(),
            ...$nodes->map(fn ($n) => ['type' => 'curriculum', 'id' => $n->id, 'title' => $n->name_bn ?: $n->name_en])->all()];
        return ['kind' => 'composed', 'body' => implode("\n", $lines), 'sources' => $sources, 'questions' => $shown, 'reveal' => $reveal];
    }

    /** AI-P1.5 evaluation: the ids the composed answer would show for a text, best first - no answer, no reveal, nothing saved */
    public function rankedQuestionIds(string $text): array
    {
        $norm = QbQuestionFinderService::normalize($text);
        return $norm === '' ? [] : $this->questions($norm)->pluck('id')->map(fn ($v) => (int) $v)->all();
    }

    /** the platform's published questions whose text, explanation or options match, rescored by the finder; at most 5 */
    private function questions(string $norm)
    {
        $ids = QbQuestion::where('status', 'published')->whereRaw('MATCH(question_text, explanation_text) AGAINST (? IN NATURAL LANGUAGE MODE)', [$norm])->limit(30)->pluck('id')
            ->merge(QbQuestionOption::whereRaw('MATCH(content_text) AGAINST (? IN NATURAL LANGUAGE MODE)', [$norm])->limit(30)->pluck('qb_question_id'))
            ->unique()->values();
        if ($ids->isEmpty()) return collect();
        return QbQuestion::where('status', 'published')->whereIn('id', $ids)->get()
            ->map(fn ($q) => ['q' => $q, 'score' => QbQuestionFinderService::score($norm, QbQuestionFinderService::normalize((string) $q->question_text))])
            ->filter(fn ($r) => $r['score'] >= self::MIN_SCORE)->sortByDesc('score')->take(self::MAX_QUESTIONS)->pluck('q')->values();
    }

    /** unlocked by the institution, or free for it now (a free price rule) */
    private function openIds($questions): array
    {
        $ids = $questions->pluck('id')->all();
        $open = QbUnlock::where('item_type', 'question')->whereIn('item_id', $ids)->pluck('item_id')->map(fn ($v) => (int) $v)->all();
        foreach ($questions as $q) {
            if (!in_array($q->id, $open, true) && ($this->pricing->quote('institution', 'question', $q)['price'] ?? null) === '0.00') $open[] = (int) $q->id;
        }
        return $open;
    }

    public function quotaLeft(): int
    {
        $limit = (int) (PlatformSetting::read(self::QUOTA_KEY, self::QUOTA_DEFAULT) ?? self::QUOTA_DEFAULT);
        return max(0, $limit - AiAnswerReveal::where('revealed_on', today()->toDateString())->count());
    }

    private function revealedToday(int $questionId): bool
    {
        return AiAnswerReveal::where('qb_question_id', $questionId)->where('revealed_on', today()->toDateString())->exists();
    }
}
