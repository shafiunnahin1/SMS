<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D197 AAD.4: one student's attendance in one routine period on a date (academics-advanced.md section 3)
class PeriodAttendance extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'student_id', 'routine_id', 'date', 'status', 'taken_by', 'note'];
    protected $casts = ['date' => 'date'];

    public function routine() { return $this->belongsTo(Routine::class); }
}
