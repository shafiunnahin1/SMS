<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D200 SUBL.1 (D96/D99/D199): the current state of one dated cover occurrence of a teacher's leave. Only the substitution services
// change it (each change: version + 1 and one event, under the institution row lock); never deleted outside tenant purge.
class LeaveSubstitutionSlot extends Model
{
    use BelongsToInstitution;

    public const STATUSES = ['unassigned', 'nominated', 'offered', 'confirmed', 'cancelled'];
    protected $fillable = ['institution_id', 'leave_application_id', 'routine_id', 'original_teacher_id', 'occurrence_date', 'source_start_time', 'source_end_time',
        'source_room_no', 'substitute_teacher_id', 'status', 'version'];
    protected $casts = ['occurrence_date' => 'date', 'version' => 'integer'];

    public function leave() { return $this->belongsTo(LeaveApplication::class, 'leave_application_id'); }
    public function routine() { return $this->belongsTo(Routine::class); }
    public function originalTeacher() { return $this->belongsTo(Teacher::class, 'original_teacher_id'); }
    public function substituteTeacher() { return $this->belongsTo(Teacher::class, 'substitute_teacher_id'); }
    public function events() { return $this->hasMany(LeaveSubstitutionEvent::class); }
}
