<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D212 HW.2: one student's submission of one homework (online, or marked as handed in on paper by the teacher)
class HomeworkSubmission extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'homework_id', 'student_id', 'file_path', 'text_answer', 'submitted_at', 'grade', 'teacher_feedback', 'feedback_at', 'status'];
    protected $casts = ['submitted_at' => 'datetime', 'feedback_at' => 'datetime'];

    public function homework() { return $this->belongsTo(Homework::class); }
    public function student() { return $this->belongsTo(Student::class); }
}
