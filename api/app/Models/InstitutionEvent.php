<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

// D213 CAL.2: an institution event (sports, cultural ...) with an audience and optional student registration
class InstitutionEvent extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = ['institution_id', 'title', 'description', 'type', 'event_date', 'start_time', 'end_time', 'venue', 'target_audience', 'program_ids',
        'registration_required', 'registration_deadline', 'max_participants', 'created_by', 'is_public'];

    protected $casts = ['event_date' => 'date', 'registration_deadline' => 'date', 'program_ids' => 'array', 'registration_required' => 'boolean', 'is_public' => 'boolean', 'max_participants' => 'integer'];

    public function registrations() { return $this->hasMany(EventRegistration::class, 'event_id'); }

    /** events a role sees: the audience is `all` or the role's own, and (for students / parents) no program list or one of $programIds */
    public function scopeFor(Builder $q, string $role, array $programIds = []): Builder
    {
        if ($role === 'admin') return $q;
        $aud = ['teacher' => 'teachers', 'student' => 'students', 'parent' => 'parents'][$role] ?? null;
        $q->whereIn('target_audience', array_filter(['all', $aud]));
        if (in_array($role, ['student', 'parent'], true)) {
            $q->where(function ($w) use ($programIds) {
                $w->whereNull('program_ids')->orWhereJsonLength('program_ids', 0);
                foreach ($programIds as $p) $w->orWhereJsonContains('program_ids', (int) $p);
            });
        }
        return $q;
    }
}
