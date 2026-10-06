<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class FeeStructure extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'program_id',
        'batch_id',
        'fee_category_id',
        'amount',
        'academic_year_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];

    public function program() { return $this->belongsTo(Program::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
    public function feeCategory() { return $this->belongsTo(FeeCategory::class); }
    public function academicYear() { return $this->belongsTo(AcademicYear::class); }
}
