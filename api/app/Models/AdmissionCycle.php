<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D209 ACY.1: one admission round for a program (docs/modules/admission-cycle.md). draft -> open -> testing -> listing -> closed.
class AdmissionCycle extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    public const STATUSES = ['draft', 'open', 'testing', 'listing', 'closed'];
    protected $fillable = ['institution_id', 'name', 'program_id', 'academic_year_id', 'seats', 'apply_from', 'apply_until', 'test_date', 'application_fee', 'status', 'rule'];
    protected $casts = ['apply_from' => 'date', 'apply_until' => 'date', 'test_date' => 'date', 'rule' => 'array', 'seats' => 'integer', 'created_at' => 'datetime'];

    public function program() { return $this->belongsTo(Program::class); }
    public function draw() { return $this->hasOne(AdmissionDraw::class, 'cycle_id'); }
    public function leads() { return $this->hasMany(AdmissionLead::class, 'cycle_id'); }

    /** applications are taken now: open, and today inside the window */
    public function accepting(): bool
    {
        $today = now()->toDateString();
        return $this->status === 'open' && $this->apply_from->toDateString() <= $today && $this->apply_until->toDateString() >= $today;
    }
}
