<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D164 (3): the writers' / moderators' review of one answer (weight: approved 1, corrected 2, rewritten 3)
class AiReview extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'ai_message_id', 'status', 'reviewer_text', 'weight', 'reviewed_by', 'reviewed_at'];
    protected $casts = ['reviewed_at' => 'datetime', 'weight' => 'integer'];
}
