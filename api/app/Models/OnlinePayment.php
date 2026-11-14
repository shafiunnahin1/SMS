<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D217 OPAY.1 (docs/modules/online-fee-payment.md): one online attempt to pay chosen dues. A financial row: never deleted (D32).
class OnlinePayment extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = ['institution_id', 'student_id', 'parent_user_id', 'gateway', 'channel', 'flow', 'collected_by', 'amount', 'gateway_fee', 'platform_fee', 'net_amount',
        'status', 'gateway_ref', 'gateway_payment_id', 'qr_payload', 'expires_at', 'trx_id', 'items', 'receipt_no', 'failure_reason', 'raw_response', 'initiated_at', 'paid_at', 'purpose'];

    protected $casts = ['items' => 'array', 'raw_response' => 'array', 'expires_at' => 'datetime', 'initiated_at' => 'datetime', 'paid_at' => 'datetime',
        'amount' => 'decimal:2', 'gateway_fee' => 'decimal:2', 'platform_fee' => 'decimal:2', 'net_amount' => 'decimal:2'];

    protected $hidden = ['raw_response'];

    public function student() { return $this->belongsTo(Student::class); }
}
