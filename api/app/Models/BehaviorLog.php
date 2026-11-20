<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D235 BHV.1: a behaviour entry; corrected with the old text in the audit log, never deleted. The parent sees positive entries at
// once and the others only after the school tells them (parent_notified).
class BehaviorLog extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'student_id', 'reported_by', 'type', 'category', 'title', 'description', 'action_taken', 'date', 'parent_notified'];
    protected $casts = ['date' => 'date:Y-m-d', 'parent_notified' => 'boolean', 'created_at' => 'datetime'];

    public function student() { return $this->belongsTo(Student::class); }
    public function reporter() { return $this->belongsTo(User::class, 'reported_by'); }
    public function scopeVisibleToParents($q) { return $q->where(fn ($w) => $w->where('type', 'positive')->orWhere('parent_notified', true)); }
}
