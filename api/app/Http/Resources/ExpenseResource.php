<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class ExpenseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'category' => $this->category, 'title' => $this->title, 'amount' => $this->amount,
            'expense_date' => $this->expense_date->format('Y-m-d'), 'note' => $this->note, 'payment_method' => $this->payment_method,
            'source' => $this->source, 'added_by' => $this->added_by, 'reversal_of_id' => $this->reversal_of_id,
            'replaces_expense_id' => $this->replaces_expense_id, 'is_reversed' => (bool) $this->reversals_exists,
            'receipt_url' => $this->receipt_path ? Storage::disk('private')->temporaryUrl($this->receipt_path, now()->addMinutes(10)) : null];
    }
}
