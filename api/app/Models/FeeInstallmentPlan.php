<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D211 INST.1: one due line of a student split into installments (docs/modules/extended-features.md section 2)
class FeeInstallmentPlan extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'student_id', 'fee_category_id', 'total_amount', 'installments', 'approved_by', 'due_key'];
    protected $casts = ['total_amount' => 'decimal:2', 'created_at' => 'datetime'];

    protected static function booted(): void
    {
        static::deleting(fn () => throw new \LogicException('installment plans are never deleted (D32)'));
    }

    public function items() { return $this->hasMany(FeeInstallment::class, 'plan_id')->orderBy('installment_no'); }
    public function student() { return $this->belongsTo(Student::class); }
    public function category() { return $this->belongsTo(FeeCategory::class, 'fee_category_id'); }
}
