<?php

namespace App\Http\Resources;

use App\Models\FeePayment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FeeRefundResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $latest = $this->snapshots->last();
        return ['id' => $this->id, 'request_key' => $this->request_key, 'revision' => $latest->revision,
            'student_id' => $this->student_id, 'original_receipt_no' => $this->original_receipt_no,
            'amount' => $this->amount, 'refund_lines' => $this->refund_lines, 'reason' => $this->reason,
            'method' => $this->method, 'status' => $latest->status, 'requested_by' => $this->requested_by,
            'approved_by' => $latest->approved_by, 'processed_by' => $latest->processed_by,
            'processed_at' => $latest->processed_at?->toIso8601String(), 'reversal_receipt_no' => $latest->reversal_receipt_no,
            'receipt_id' => $latest->reversal_receipt_no ? FeePayment::where('receipt_no', $latest->reversal_receipt_no)->value('id') : null,
            'history' => $this->snapshots->map(fn ($row) => ['id' => $row->id, 'revision' => $row->revision,
                'status' => $row->status, 'requested_by' => $row->requested_by, 'approved_by' => $row->approved_by,
                'processed_by' => $row->processed_by, 'processed_at' => $row->processed_at?->toIso8601String()])->all()];
    }
}
