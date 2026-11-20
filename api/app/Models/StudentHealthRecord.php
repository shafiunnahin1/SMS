<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D235 HLT.1: a student's health record - sensitive; never written to logs, audited by field names only
class StudentHealthRecord extends Model
{
    use BelongsToInstitution;

    const CREATED_AT = null;
    public const FIELDS = ['height_cm', 'weight_kg', 'blood_group', 'vision_left', 'vision_right', 'medical_conditions', 'emergency_contact', 'emergency_phone', 'doctor_name', 'doctor_phone', 'last_checkup_date', 'notes'];
    public const TEACHER_FIELDS = ['blood_group', 'medical_conditions', 'emergency_contact', 'emergency_phone'];   // D235 (6): what a teacher of the student's batch sees
    protected $fillable = ['institution_id', 'student_id', 'height_cm', 'weight_kg', 'blood_group', 'vision_left', 'vision_right', 'medical_conditions', 'emergency_contact', 'emergency_phone', 'doctor_name', 'doctor_phone', 'last_checkup_date', 'notes'];
    protected $casts = ['height_cm' => 'decimal:1', 'weight_kg' => 'decimal:1', 'last_checkup_date' => 'date:Y-m-d', 'updated_at' => 'datetime'];

    public function student() { return $this->belongsTo(Student::class); }
}
