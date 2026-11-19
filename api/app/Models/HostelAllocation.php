<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.1: a student in a room from check-in to check-out; a change or check-out ends it, never deletes it
class HostelAllocation extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'student_id', 'room_id', 'check_in_date', 'check_out_date', 'status'];
    protected $casts = ['check_in_date' => 'date:Y-m-d', 'check_out_date' => 'date:Y-m-d'];

    public function student() { return $this->belongsTo(Student::class); }
    public function room() { return $this->belongsTo(HostelRoom::class, 'room_id'); }
    public function scopeActive($q) { return $q->where('status', 'active'); }
}
