<?php

namespace App\Models;

use App\Traits\BelongsToOptionalInstitution;
use Illuminate\Database\Eloquent\Model;

// D164 (3): a reviewed answer the assistant gives directly; institution_id NULL = written by a platform reviewer, open to every
// institution (read with Tenancy::withoutTenancy and an explicit "NULL or this institution" condition)
class AiAnswerBank extends Model
{
    use BelongsToOptionalInstitution;

    protected $table = 'ai_answer_bank';
    protected $fillable = ['institution_id', 'question_text', 'answer_text', 'weight', 'ai_review_id', 'sources'];
    protected $casts = ['sources' => 'array', 'weight' => 'integer'];
}
