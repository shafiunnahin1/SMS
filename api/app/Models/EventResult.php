<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D242 EVT.1: a student's result in an event (position, award, points); one per student per event; changes are audited
class EventResult extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'event_id', 'student_id', 'position', 'award', 'points', 'certificate_issued', 'remarks'];
    protected $casts = ['position' => 'integer', 'points' => 'integer', 'certificate_issued' => 'boolean'];

    public function event() { return $this->belongsTo(InstitutionEvent::class, 'event_id'); }
    public function student() { return $this->belongsTo(Student::class); }
}
