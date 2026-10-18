<?php

namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class FeeCategoryResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id, 'name' => $this->name, 'amount' => $this->amount, 'frequency' => $this->frequency,
            'applicable_to' => $this->applicable_to ?? 'all',
            'in_use' => (bool) ($this->payments_exists ?? false),
        ];
    }
}
