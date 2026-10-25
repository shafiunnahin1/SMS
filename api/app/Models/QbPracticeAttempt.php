<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D165 ST.4: one practice round of a student (questions they may open; marked on the server)
class QbPracticeAttempt extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'student_user_id', 'qb_subject_id', 'qb_chapter_id', 'question_ids', 'answers', 'total', 'correct', 'submitted_at'];
    protected $casts = ['question_ids' => 'array', 'answers' => 'array', 'submitted_at' => 'datetime'];
}
