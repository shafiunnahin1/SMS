<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D164: a teacher's or the head's chat with the assistant (own chats only)
class AiConversation extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'user_id', 'title'];

    public function messages() { return $this->hasMany(AiMessage::class)->orderBy('id'); }
}
