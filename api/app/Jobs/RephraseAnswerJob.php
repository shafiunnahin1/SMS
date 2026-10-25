<?php

namespace App\Jobs;

use App\Models\AiMessage;
use App\Services\Ai\AnswerRephraser;
use App\Traits\TenantAwareJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

// D164 (6) AI-P1.6: after a composed answer is shown, the small model rephrases it; a trusted reply replaces the body (the template kept in
// `template_body`, AI-P1.6.1), anything else leaves the template. `model_version` says the state: PENDING while it writes, the model's name when replaced, NULL = template.
// A reviewer's text is never rephrased.
class RephraseAnswerJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public const PENDING = 'pending';

    public int $tries = 1;

    public function __construct(public int $messageId, int $institutionId)
    {
        $this->institutionId = $institutionId;
        $this->timeout = (int) config('services.ai_llm.timeout', 45) + 15;
    }

    public function handle(AnswerRephraser $rephraser): void
    {
        $m = AiMessage::with('review')->find($this->messageId);
        if (!$m || $m->model_version !== self::PENDING) return;
        $out = $m->review?->reviewer_text ? null : $rephraser->rephrase($m->body);
        $m->update($out === null ? ['model_version' => null] : ['template_body' => $m->body, 'body' => $out, 'model_version' => mb_substr(AnswerRephraser::model(), 0, 40)]);
    }

    public function failed(\Throwable $e): void
    {
        AiMessage::where('id', $this->messageId)->where('model_version', self::PENDING)->update(['model_version' => null]);
    }
}
