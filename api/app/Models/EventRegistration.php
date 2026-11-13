<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D213 CAL.2: a student's registration for an event
class EventRegistration extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = ['institution_id', 'event_id', 'student_id', 'registered_at', 'status'];

    protected $casts = ['registered_at' => 'datetime'];

    public function event() { return $this->belongsTo(InstitutionEvent::class, 'event_id'); }
    public function student() { return $this->belongsTo(Student::class); }
}
