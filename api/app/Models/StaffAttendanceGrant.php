<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D169 (4) STW.5: one staff member may take and correct one batch's attendance while this grant is active (revoked_at NULL)
class StaffAttendanceGrant extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'batch_id', 'user_id', 'granted_by', 'revoked_by', 'revoked_at'];
    protected $casts = ['revoked_at' => 'datetime'];

    public function batch() { return $this->belongsTo(Batch::class); }
    public function user() { return $this->belongsTo(User::class); }

    public function scopeActive($q) { return $q->whereNull('revoked_at'); }
}
