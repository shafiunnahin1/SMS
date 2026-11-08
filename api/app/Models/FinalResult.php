<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D197 AAD.2: one student's computed final result on a result sheet (per-subject details in JSON)
class FinalResult extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'result_sheet_id', 'student_id', 'total_percentage', 'gpa', 'grade', 'position_program', 'position_batch', 'is_pass', 'details'];
    protected $casts = ['details' => 'array', 'is_pass' => 'boolean', 'total_percentage' => 'decimal:2', 'gpa' => 'decimal:2'];

    public function student() { return $this->belongsTo(Student::class); }
}
