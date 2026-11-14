<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D213 CAL.3: one student's seat in one exam
class ExamSeatPlan extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = ['institution_id', 'exam_id', 'student_id', 'room_name', 'seat_number', 'seat_row', 'column_number'];

    protected $casts = ['seat_row' => 'integer', 'column_number' => 'integer'];

    public function student() { return $this->belongsTo(Student::class); }
}
