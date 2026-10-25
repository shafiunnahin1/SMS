<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D164 (2): one free answer of a locked question shown by the assistant (one per question per institution per day)
class AiAnswerReveal extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'qb_question_id', 'user_id', 'ai_message_id', 'revealed_on'];
    protected $casts = ['revealed_on' => 'date'];
}
