<?php

namespace App\Models;

use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class FeeRefund extends Model
{
    use BelongsToInstitution, HasFactory;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'student_id', 'request_key', 'revision', 'original_receipt_no',
        'amount', 'refund_lines', 'reason', 'method', 'online_payment_id', 'gateway_refund_ref', 'status',
        'reversal_receipt_no', 'requested_by', 'approved_by', 'processed_by', 'processed_at'];
    protected $casts = ['amount' => 'decimal:2', 'refund_lines' => 'array', 'revision' => 'integer',
        'created_at' => 'datetime', 'processed_at' => 'datetime'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new BusinessException(__('refund.immutable'), 'refund_immutable', 409));
        static::deleting(fn () => throw new BusinessException(__('refund.immutable'), 'refund_immutable', 409));
    }
}
