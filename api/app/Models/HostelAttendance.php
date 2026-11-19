<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.4: a resident's night (present / absent / leave); one row per student per date
class HostelAttendance extends Model
{
    use BelongsToInstitution;

    protected $table = 'hostel_attendance';
    protected $fillable = ['institution_id', 'hostel_id', 'student_id', 'date', 'status', 'marked_by'];
    protected $casts = ['date' => 'date:Y-m-d'];

    public function student() { return $this->belongsTo(Student::class); }
}
