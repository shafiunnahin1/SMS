<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D236 SCH.1: one application per student per scholarship; decided once (an approval may be revoked to rejected); never deleted
class ScholarshipApplication extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'scholarship_id', 'student_id', 'reason', 'documents', 'gpa', 'household_income', 'status', 'awarded_amount', 'approved_by'];
    protected $casts = ['documents' => 'array', 'gpa' => 'decimal:2', 'awarded_amount' => 'decimal:2', 'created_at' => 'datetime'];

    public function scholarship() { return $this->belongsTo(Scholarship::class); }
    public function student() { return $this->belongsTo(Student::class); }
    public function approver() { return $this->belongsTo(User::class, 'approved_by'); }
}
