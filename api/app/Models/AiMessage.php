<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D164 (2): a question or the assistant's answer, with its sources
class AiMessage extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'ai_conversation_id', 'role', 'body', 'kind', 'sources', 'rating', 'model_version'];
    protected $casts = ['sources' => 'array', 'rating' => 'integer'];

    public function review() { return $this->hasOne(AiReview::class); }
}
