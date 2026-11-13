<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D211 INST.1: one installment of a plan; a paid one is never changed or deleted (D32)
class FeeInstallment extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['plan_id', 'institution_id', 'installment_no', 'amount', 'due_date', 'paid_at', 'payment_id', 'status', 'reminded_before_at', 'reminded_overdue_at'];
    protected $casts = ['amount' => 'decimal:2', 'due_date' => 'date', 'paid_at' => 'datetime', 'reminded_before_at' => 'datetime', 'reminded_overdue_at' => 'datetime'];

    protected static function booted(): void
    {
        static::deleting(fn () => throw new \LogicException('installments are never deleted (D32)'));
    }

    public function plan() { return $this->belongsTo(FeeInstallmentPlan::class, 'plan_id'); }
}
