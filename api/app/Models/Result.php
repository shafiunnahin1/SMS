<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Result extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'exam_id',
        'student_id',
        'subject_id',
        'marks_obtained',
        'component_marks',
        'percentage',
        'grade',
        'grade_point',
        'is_absent',
        'is_pass',
        'teacher_remarks',
    ];

    protected $casts = [
        'marks_obtained' => 'decimal:2',
        'component_marks' => 'array',
        'percentage' => 'decimal:2',
        'grade_point' => 'decimal:2',
        'is_absent' => 'boolean',
        'is_pass' => 'boolean',
    ];

    public function exam() { return $this->belongsTo(Exam::class); }
    public function student() { return $this->belongsTo(Student::class); }
    public function subject() { return $this->belongsTo(Subject::class); }
}
