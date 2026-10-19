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
            'locked_at' => $this->locked_at?->toIso8601String(),
        ];
    }
}