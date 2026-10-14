<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CashBookClosingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'date' => $this->date->format('Y-m-d'), 'revision' => $this->revision,
            'opening_cash' => $this->opening_cash, 'cash_in' => $this->cash_in, 'cash_out' => $this->cash_out,
            'expected_closing' => $this->expected_closing, 'counted_cash' => $this->counted_cash, 'difference' => $this->difference,
            'status' => $this->status, 'note' => $this->note, 'closed_by' => $this->closed_by, 'closed_at' => $this->closed_at?->toIso8601String(),
            'reopened_by' => $this->reopened_by, 'reopened_at' => $this->reopened_at?->toIso8601String(), 'reopen_reason' => $this->reopen_reason];
    }
}
