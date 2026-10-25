<?php

namespace App\Services\Ai;

use App\Exceptions\BusinessException;
use App\Models\{AiAnswerBank, AiMessage, AiReview, AuditLog, Institution, User};
use App\Notifications\GeneralNotification;
use App\Support\Tenancy;

/**
 * D164 (3) AI-P1.4: the platform writers' / moderators' review queue (central host). Every institution's answers are read here,
 * de-identified - no teacher, institution, phone or 10-digit ID - unless the head switched off sending them to review. Thumbs-down
 * first, then "not found", then the oldest. A reviewer approves (weight 1), corrects (2) or rewrites (3); the corrected or rewritten
 * text replaces the shown answer (the first answer stays as history) and the asker is told in-app; every reviewed answer joins the
 * answer bank, open to every institution, with the questions it came from as sources (a bank answer naming a locked question still
 * counts against the asker's daily free quota - AssistantService::fromBank).
 */
class AiReviewService
{
    public const WEIGHTS = ['approved' => 1, 'corrected' => 2, 'rewritten' => 3];
    public const SETTING = 'ai_send_to_review';

    /** a phone (01xxxxxxxxx) or a 10-digit student ID never reaches a reviewer or the bank */
    public static function deidentify(string $text, bool $forBank = false): string
    {
        // the bank keeps no placeholder either: it would only lower the match with the next asker's question
        $out = preg_replace(['/(?<!\d)(?:\+?88)?01\d{9}(?!\d)/u', '/(?<!\d)\d{10}(?!\d)/u'], $forBank ? ['', ''] : ['[ফোন]', '[আইডি]'], $text);
        return $forBank ? trim(preg_replace('/\s+/u', ' ', $out)) : $out;
    }

    public static function sendsToReview(Institution $i): bool
    {
        return ($i->settings[self::SETTING] ?? true) !== false;
    }

    public function queue(string $status = 'unreviewed', int $limit = 50): array
    {
        return Tenancy::withoutTenancy(function () use ($status, $limit) {
            $off = Institution::all()->reject(fn ($i) => self::sendsToReview($i))->pluck('id')->all();
            $rows = AiReview::query()->where('ai_reviews.status', $status)->whereNotIn('ai_reviews.institution_id', $off ?: [0])
                ->join('ai_messages', 'ai_messages.id', '=', 'ai_reviews.ai_message_id')
                ->orderByRaw("CASE WHEN ai_messages.rating = -1 THEN 0 WHEN ai_messages.kind = 'not_found' THEN 1 ELSE 2 END")->orderBy('ai_reviews.id')
                ->limit($limit)->get(['ai_reviews.*']);
            return $rows->map(fn ($r) => $this->row($r))->all();
        });
    }

    public function decide(int $reviewId, string $status, ?string $text, User $reviewer): array
    {
        if (!isset(self::WEIGHTS[$status])) throw new BusinessException('unknown review status', 'ai_review_status', 422);
        if ($status !== 'approved' && trim((string) $text) === '') throw new BusinessException('write the corrected answer', 'ai_review_text', 422);
        return Tenancy::withoutTenancy(function () use ($reviewId, $status, $text, $reviewer) {
            $review = AiReview::findOrFail($reviewId);
            $institution = Institution::findOrFail($review->institution_id);
            if (!self::sendsToReview($institution)) abort(404);              // the head keeps this institution's answers out of review
            return Tenancy::as($institution, function () use ($review, $status, $text, $reviewer) {
                $answer = AiMessage::findOrFail($review->ai_message_id);
                $question = AiMessage::where('ai_conversation_id', $answer->ai_conversation_id)->where('role', 'question')->where('id', '<', $answer->id)->orderByDesc('id')->first();
                $final = $status === 'approved' ? $answer->body : self::deidentify(trim($text));
                $review->update(['status' => $status, 'reviewer_text' => $status === 'approved' ? null : $final, 'weight' => self::WEIGHTS[$status],
                    'reviewed_by' => $reviewer->id, 'reviewed_at' => now()]);
                if ($question && !($status === 'approved' && $answer->kind === 'not_found')) {   // approving "not found" teaches nothing
                    Tenancy::withoutTenancy(fn () => AiAnswerBank::create(['institution_id' => null, 'question_text' => self::deidentify((string) $question?->body, true),
                        'answer_text' => $final, 'weight' => self::WEIGHTS[$status], 'ai_review_id' => $review->id,
                        'sources' => collect($answer->sources ?? [])->where('type', 'question')->map(fn ($s) => ['type' => 'question', 'id' => $s['id']])->values()->all()]));
                }
                if ($status !== 'approved') {
                    $asker = User::find($answer->conversation?->user_id);
                    $asker?->notify(new GeneralNotification(__('ai.review_title'), __('ai.review_body'), 'ai_review', ['conversation_id' => $answer->ai_conversation_id]));
                }
                AuditLog::record("ai.review_{$status}", $answer, ['review_id' => $review->id]);
                return $this->row($review->fresh());
            });
        });
    }

    /** what a reviewer sees: the question and answer texts (de-identified), kind, rating, sources - never who asked or where */
    private function row(AiReview $r): array
    {
        $answer = AiMessage::find($r->ai_message_id);
        $question = $answer ? AiMessage::where('ai_conversation_id', $answer->ai_conversation_id)->where('role', 'question')->where('id', '<', $answer->id)->orderByDesc('id')->first() : null;
        return ['id' => $r->id, 'status' => $r->status, 'weight' => $r->weight, 'question' => self::deidentify((string) $question?->body),
            'answer' => self::deidentify((string) $answer?->body), 'kind' => $answer?->kind, 'rating' => $answer?->rating,
            'sources' => $answer?->sources ?? [], 'reviewer_text' => $r->reviewer_text, 'created_at' => $r->created_at?->toIso8601String()];
    }
}
