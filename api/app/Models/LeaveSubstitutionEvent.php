<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D200 SUBL.1 (D96/D98/D99): append-only history of one slot version with its source snapshot - never updated or deleted outside
// tenant purge.
class LeaveSubstitutionEvent extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    public const TYPES = ['slot_created', 'leave_approved', 'nomination_set', 'nomination_cleared', 'offer_created', 'offer_accepted', 'offer_declined',
        'cover_replaced', 'cover_cleared', 'leave_rejected', 'leave_cancelled', 'source_invalidated', 'substitute_leave_invalidated', 'source_refreshed'];
    protected $fillable = ['leave_substitution_operation_id', 'institution_id', 'leave_substitution_slot_id', 'leave_application_id', 'version', 'result_status',
        'event_type', 'user_id', 'original_teacher_id', 'source_program_id', 'source_batch_id', 'source_subject_id', 'substitute_teacher_id', 'department_id',
        'occurrence_date', 'source_start_time', 'source_end_time', 'source_room_no', 'reason_code', 'reason_note', 'idempotency_key', 'payload_sha256'];
    protected $casts = ['occurrence_date' => 'date', 'version' => 'integer', 'created_at' => 'datetime'];

    public function slot() { return $this->belongsTo(LeaveSubstitutionSlot::class, 'leave_substitution_slot_id'); }
    public function operation() { return $this->belongsTo(LeaveSubstitutionOperation::class, 'leave_substitution_operation_id'); }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('leave_substitution_events are append-only'));
        static::deleting(fn () => throw new \LogicException('leave_substitution_events are append-only'));
    }
}
