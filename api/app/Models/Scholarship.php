<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D236 SCH.1: a scholarship with exactly one benefit - a fixed amount (a grant, never touches fees) or a percentage of the monthly tuition
class Scholarship extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'name', 'description', 'amount', 'percentage', 'criteria', 'funded_by', 'academic_year_id', 'total_slots', 'available_slots', 'application_deadline', 'status'];
    protected $casts = ['amount' => 'decimal:2', 'percentage' => 'decimal:2', 'application_deadline' => 'date:Y-m-d', 'total_slots' => 'integer', 'available_slots' => 'integer', 'created_at' => 'datetime'];

    public function academicYear() { return $this->belongsTo(AcademicYear::class); }
    public function applications() { return $this->hasMany(ScholarshipApplication::class); }

    /** open for applications: open, before / on the deadline and with a slot left */
    public function acceptsApplications(): bool
    {
        return $this->status === 'open' && (!$this->application_deadline || !$this->application_deadline->lt(today()))
            && ($this->available_slots === null || $this->available_slots > 0);
    }
}
