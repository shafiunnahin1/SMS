<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class QbOmrScanResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'form_id' => $this->qb_omr_form_id,
            'layout_version' => $this->layout_version,
            'set_code' => $this->set_code,
            'roll' => $this->roll,
            'answers' => $this->answers_json,
            'answered_count' => $this->answered_count,
            'matched_student_id' => $this->matched_student_id,
            'student_name' => $this->whenLoaded('matchedStudent', fn () => $this->matchedStudent?->user?->name),
            'correct_count' => $this->correct_count,
            'obtained_marks' => $this->obtained_marks,
            'status' => $this->status,
            'comparison' => $this->comparison_json,
            'image_available' => filled($this->image_path),
            'source' => $this->source,
        ];
    }
}