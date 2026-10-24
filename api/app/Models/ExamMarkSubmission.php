<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D162: an exam subject's marks state - draft, submitted, unlock_requested or unlocked (no row = draft)
class ExamMarkSubmission extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'exam_subject_id', 'status', 'submitted_by', 'submitted_at', 'request_reason', 'requested_by', 'requested_at',
        'decided_by', 'decided_at', 'decision_note'];
    protected $casts = ['submitted_at' => 'datetime', 'requested_at' => 'datetime', 'decided_at' => 'datetime'];
}
