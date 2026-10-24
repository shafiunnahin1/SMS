<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QbOmrFormResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'paper_id' => $this->qb_paper_id,
            'code' => $this->code,
            'settings' => $this->settings_json,
            'layout_version' => $this->layout_version,
            'fits' => app(\App\Services\QuestionBank\QbOmrFormService::class)->fits($this->resource),   // owner 2026-10-24: the content fits its page at full size
            'locked_at' => $this->locked_at?->toIso8601String(),
            'set_codes' => \App\Models\QbPaperVariant::where('qb_paper_id', $this->qb_paper_id)->orderBy('variant_number')->pluck('code')->all(),   // D127: the scanner maps set bubbles to codes
        ];
    }
}