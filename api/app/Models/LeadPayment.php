<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D209 ACY.2: one application-fee payment or reversal (negative amount). Never updated or deleted (D32).
class LeadPayment extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    public const METHODS = ['cash', 'online'];
    protected $fillable = ['institution_id', 'lead_id', 'online_payment_id', 'method', 'received_by', 'amount', 'receipt_no', 'paid_at'];
    protected $casts = ['amount' => 'decimal:2', 'paid_at' => 'datetime'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('lead payments are never changed (D32)'));
        static::deleting(fn () => throw new \LogicException('lead payments are never deleted (D32)'));
    }

    public function lead() { return $this->belongsTo(AdmissionLead::class, 'lead_id'); }
}
