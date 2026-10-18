<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InventoryMovementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'item_id' => $this->item_id, 'type' => $this->type, 'qty' => $this->qty, 'direction' => $this->direction,
            'unit_amount' => $this->unit_amount, 'total_amount' => $this->total_amount, 'balance_after' => $this->balance_after,
            'student_id' => $this->student_id, 'issued_to_type' => $this->issued_to_type, 'issued_to_id' => $this->issued_to_id,
            'supplier' => $this->supplier, 'receipt_no' => $this->receipt_no, 'payment_method' => $this->payment_method,
            'reference' => $this->reference, 'note' => $this->note, 'created_by' => $this->created_by, 'created_at' => $this->created_at?->toIso8601String()];
    }
}
