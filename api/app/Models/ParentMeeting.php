<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D235 MTG.1: pending -> confirmed -> completed, or cancelled; notes collect the parent's re-time requests and the outcome
class ParentMeeting extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'student_id', 'teacher_id', 'requested_by', 'subject', 'proposed_date', 'proposed_time', 'location', 'status', 'notes', 'parent_response_at'];
    protected $casts = ['proposed_date' => 'date:Y-m-d', 'created_at' => 'datetime', 'parent_response_at' => 'datetime'];

    public function student() { return $this->belongsTo(Student::class); }
    public function teacher() { return $this->belongsTo(Teacher::class); }
}
