<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3
class QbPaper extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'created_by', 'title', 'program_id', 'qb_subject_id', 'exam_name', 'duration_minutes', 'total_marks', 'instructions_json', 'status', 'sets_count'];
    protected $casts = ['total_marks' => 'decimal:2', 'instructions_json' => 'array'];
}
