<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// D197 AAD.3: a student's leave (academics-advanced.md section 5). Approved leave makes `leave` the attendance default on its
// dates and stops the absent SMS; the attachment (a doctor's note) is on the private disk and only ever given as a signed link.
class StudentLeaveRequest extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'student_id', 'from_date', 'to_date', 'total_days', 'reason', 'attachment', 'method', 'status',
        'requested_by', 'decided_by', 'decided_at', 'decision_note'];
    protected $casts = ['from_date' => 'date', 'to_date' => 'date', 'decided_at' => 'datetime', 'created_at' => 'datetime', 'total_days' => 'integer'];

    public function student(): BelongsTo { return $this->belongsTo(Student::class); }

    /** student id => true for approved leave covering $date */
    public static function onLeave(array $studentIds, string $date): array
    {
        if (!$studentIds) return [];
        return static::where('status', 'approved')->whereIn('student_id', $studentIds)->whereDate('from_date', '<=', $date)->whereDate('to_date', '>=', $date)
            ->pluck('student_id')->flip()->map(fn () => true)->all();
    }
}
