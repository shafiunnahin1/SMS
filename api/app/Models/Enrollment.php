<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Enrollment extends Model
{
    use BelongsToInstitution;

    protected $fillable = [
        'institution_id',
        'student_id',
        'program_id',
        'batch_id',
        'academic_year_id',
        'roll_no',
        'optional_subject_id',
        'fee_override',
        'is_primary',
        'enrolled_at',
        'left_at',
        'status',
        'note',
    ];

    protected $casts = [
        'fee_override' => 'decimal:2',
        'is_primary' => 'boolean',
        'enrolled_at' => 'date',
        'left_at' => 'date',
    ];

    public function student() { return $this->belongsTo(Student::class); }
    public function program() { return $this->belongsTo(Program::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
    public function academicYear() { return $this->belongsTo(AcademicYear::class); }
    public function optionalSubject() { return $this->belongsTo(Subject::class); }
}
