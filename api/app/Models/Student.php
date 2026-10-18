<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\{Builder, Model, SoftDeletes};

class Student extends Model
{
    use BelongsToInstitution, SoftDeletes;

    const UPDATED_AT = null;

    protected $fillable = [
        'institution_id', 'user_id', 'student_id', 'date_of_birth', 'gender', 'blood_group', 'religion',
        'father_name', 'mother_name', 'guardian_phone', 'address', 'photo', 'admission_date', 'status',
        'studying_at', 'board_reg_no', 'board_roll_no',
    ];   // NOT program_id / batch_id / roll_no - see EnrollmentService (docs/modules/academic-structure.md)

    protected $casts = ['date_of_birth' => 'date', 'admission_date' => 'date', 'anonymized_at' => 'datetime'];

    // Relations
    public function user()          { return $this->belongsTo(User::class); }
    public function program()       { return $this->belongsTo(Program::class); }       // cache of the primary enrollment
    public function batch()         { return $this->belongsTo(Batch::class); }         // cache of the primary enrollment
    public function enrollments()   { return $this->hasMany(Enrollment::class); }
    public function activeEnrollments() { return $this->enrollments()->where('status', 'active'); }
    public function primaryEnrollment() { return $this->hasOne(Enrollment::class)->where('status', 'active')->where('is_primary', 1); }
    public function attendances()   { return $this->hasMany(Attendance::class); }
    public function results()       { return $this->hasMany(Result::class); }
    public function feePayments()   { return $this->hasMany(FeePayment::class); }
    public function parents()       { return $this->belongsToMany(User::class, 'parent_student', 'student_id', 'parent_user_id')->withPivot('relationship', 'is_primary'); }
    public function primaryParent() { return $this->parents()->wherePivot('is_primary', true)->first(); }

    // Scopes - ALWAYS use these (not where('batch_id'...)) so multi-batch students (coaching) are handled
    public function scopeActive(Builder $q)                    { return $q->where('status', 'active'); }
    public function scopeInBatch(Builder $q, int $batchId)     { return $q->whereHas('enrollments', fn ($e) => $e->where('batch_id', $batchId)->where('status', 'active')); }
    public function scopeInProgram(Builder $q, int $programId) { return $q->whereHas('enrollments', fn ($e) => $e->where('program_id', $programId)->where('status', 'active')); }
}
