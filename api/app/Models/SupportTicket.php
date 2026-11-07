<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D193 SUP.1: one support ticket of an institution to the platform (platform-ops.md section 1)
class SupportTicket extends Model
{
    use BelongsToInstitution;

    public const CATEGORIES = ['general', 'billing', 'bug', 'how_to', 'feature', 'sms', 'payment', 'domain'];
    public const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

    protected $fillable = ['institution_id', 'ticket_no', 'subject', 'category', 'priority', 'status', 'created_by', 'assigned_to',
        'first_response_due_at', 'first_responded_at', 'resolved_at', 'closed_at', 'rating', 'rating_note'];
    protected $casts = ['first_response_due_at' => 'datetime', 'first_responded_at' => 'datetime', 'resolved_at' => 'datetime', 'closed_at' => 'datetime', 'rating' => 'integer'];

    public function messages() { return $this->hasMany(SupportTicketMessage::class, 'ticket_id'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function institution() { return $this->belongsTo(Institution::class); }
}
