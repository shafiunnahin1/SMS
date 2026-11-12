<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Batch extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'program_id',
        'name',
        'teacher_id',
        'academic_year_id',
        'start_date',
        'end_date',
        'schedule',
        'monthly_fee',
        'room',
        'max_capacity',
        'status',
        'name_alt',
        'shift',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'schedule' => 'array',
        'monthly_fee' => 'decimal:2',
    ];

    public function program() { return $this->belongsTo(Program::class); }
    public function teacher() { return $this->belongsTo(Teacher::class); }
    public function academicYear() { return $this->belongsTo(AcademicYear::class); }
    public function subjectTeachers() { return $this->hasMany(BatchTeacher::class); }
    public function activeEnrollments() { return $this->hasMany(Enrollment::class)->where('status', 'active'); }

    // D202 PUB.2: the public site shows these; its cached payload is forgotten on every change
    protected static function booted(): void
    {
        static::saved(fn ($m) => \App\Services\PublicSite\PublicSiteService::forget($m->institution_id));
        static::deleted(fn ($m) => \App\Services\PublicSite\PublicSiteService::forget($m->institution_id));
    }
}
