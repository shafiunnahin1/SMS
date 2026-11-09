<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D200 SUBL.1 (D99): the immutable receipt of one successful substitution request - written once, never updated or deleted
// outside tenant purge; a replay with the same key and digest returns its manifest (the linked events).
class LeaveSubstitutionOperation extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'leave_application_id', 'user_id', 'department_id', 'action', 'idempotency_key_sha256', 'payload_sha256',
        'result_code', 'result_http_status', 'result_slot_count'];
    protected $casts = ['result_http_status' => 'integer', 'result_slot_count' => 'integer', 'created_at' => 'datetime'];

    public function events() { return $this->hasMany(LeaveSubstitutionEvent::class); }

    protected static function booted(): void
    {
        static::updating(fn () => throw new \LogicException('leave_substitution_operations are immutable'));
        static::deleting(fn () => throw new \LogicException('leave_substitution_operations are immutable'));
    }
}
