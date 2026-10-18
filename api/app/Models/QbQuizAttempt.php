<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3
class QbQuizAttempt extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = ['institution_id', 'student_user_id', 'qb_quiz_id', 'started_at', 'submitted_at', 'score', 'total', 'answers'];
    protected $casts = ['started_at' => 'datetime', 'submitted_at' => 'datetime', 'score' => 'decimal:2', 'total' => 'decimal:2', 'answers' => 'array'];
}
