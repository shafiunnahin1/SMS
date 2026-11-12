<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D202 PUB.1: one admission inquiry or application. `enrolled` and `converted_student_id` are set only by the convert action.
class AdmissionLead extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    public const OPEN = ['new', 'contacted', 'visited'];
    public const SOURCES = ['website', 'facebook', 'referral', 'walk_in', 'leaflet'];
    protected $fillable = ['institution_id', 'name', 'phone', 'guardian_name', 'email', 'current_class', 'message', 'interested_program_id', 'interested_batch_id',
        'source', 'ip_hash', 'status', 'follow_up_date', 'note', 'converted_student_id', 'consented_at', 'created_by'];
    protected $casts = ['follow_up_date' => 'date', 'consented_at' => 'datetime', 'created_at' => 'datetime'];
    protected $hidden = ['ip_hash'];

    public function program() { return $this->belongsTo(Program::class, 'interested_program_id'); }
    public function batch() { return $this->belongsTo(Batch::class, 'interested_batch_id'); }
}
