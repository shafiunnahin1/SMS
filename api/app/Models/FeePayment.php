<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class FeePayment extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'student_id',
        'enrollment_id',
        'online_payment_id',
        'batch_id',
        'fee_category_id',
        'amount',
        'discount',
        'paid_amount',
        'month',
        'payment_method',
        'receipt_no',
        'line_no',
        'paid_at',
        'collected_by',
        'status',
        'reverses_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'discount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'paid_at' => 'datetime',
    ];

    public function student() { return $this->belongsTo(Student::class); }
    public function enrollment() { return $this->belongsTo(Enrollment::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
    public function feeCategory() { return $this->belongsTo(FeeCategory::class); }
    public function reverses() { return $this->belongsTo(FeePayment::class); }
}
