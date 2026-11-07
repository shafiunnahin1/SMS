<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D193 RTN.1: one weekly routine slot - a subject of a program (and batch) taught by a teacher on a day, start - end, in a room
class Routine extends Model
{
    use BelongsToInstitution;

    public const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'];

    public $timestamps = false;
    protected $fillable = ['institution_id', 'program_id', 'batch_id', 'subject_id', 'teacher_id', 'day_of_week', 'start_time', 'end_time', 'room_no'];

    public function program() { return $this->belongsTo(Program::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
    public function subject() { return $this->belongsTo(Subject::class); }
    public function teacher() { return $this->belongsTo(Teacher::class); }
}
