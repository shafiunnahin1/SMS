<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D231 OCL.1: an online class for one batch (batch_id) or a whole program (batch_id NULL); cancelled, never deleted
class OnlineClass extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'teacher_id', 'program_id', 'batch_id', 'subject_id', 'title', 'description', 'platform', 'meeting_link', 'meeting_id', 'passcode', 'scheduled_at', 'duration_minutes', 'status', 'recording_url'];
    protected $casts = ['scheduled_at' => 'datetime', 'duration_minutes' => 'integer', 'created_at' => 'datetime'];

    public function teacher() { return $this->belongsTo(Teacher::class); }
    public function program() { return $this->belongsTo(Program::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
    public function subject() { return $this->belongsTo(Subject::class); }

    public function endsAt() { return $this->scheduled_at->copy()->addMinutes((int) ($this->duration_minutes ?? 60)); }

    /** scheduled | live | ended | completed | cancelled - live and ended come from the clock, never stored */
    public function displayStatus(): string
    {
        if (in_array($this->status, ['completed', 'cancelled'], true)) return $this->status;
        $now = now();
        if ($now->lt($this->scheduled_at)) return 'scheduled';
        return $now->lte($this->endsAt()) ? 'live' : 'ended';
    }
}
