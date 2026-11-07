<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D193 SUP.1: one message of a ticket; an internal (platform-only) note never reaches the institution
class SupportTicketMessage extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'ticket_id', 'author_type', 'author_id', 'body', 'is_internal', 'attachments'];
    protected $casts = ['is_internal' => 'boolean', 'attachments' => 'array', 'created_at' => 'datetime'];

    public function author() { return $this->belongsTo(User::class, 'author_id'); }
}
