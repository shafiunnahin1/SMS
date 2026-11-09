<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D197 AAD.5: a fixed block of the day (break, assembly, prayer, other) for one program or all (NULL), one day or every day (NULL).
// No class may be routined into it (RoutineService conflict `block`); the routine print shows it as a grey column.
class RoutineBlock extends Model
{
    use BelongsToInstitution;

    public const KINDS = ['break', 'assembly', 'prayer', 'other'];
    public $timestamps = false;
    protected $fillable = ['institution_id', 'program_id', 'day_of_week', 'start_time', 'end_time', 'kind', 'label', 'sort_order'];
    protected $casts = ['sort_order' => 'integer'];

    public function program() { return $this->belongsTo(Program::class); }

    /** blocks that apply to a program on a day (program NULL = all, day NULL = every day) */
    public function scopeFor($q, int $programId, ?string $day = null)
    {
        return $q->where(fn ($w) => $w->whereNull('program_id')->orWhere('program_id', $programId))
            ->when($day, fn ($w) => $w->where(fn ($d) => $d->whereNull('day_of_week')->orWhere('day_of_week', $day)));
    }
}
