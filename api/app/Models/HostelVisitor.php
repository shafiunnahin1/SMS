<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.4: a visitor of a hostel resident; corrected with an audit trail, never deleted
class HostelVisitor extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'hostel_id', 'student_id', 'visitor_name', 'relation', 'phone', 'purpose', 'in_at', 'out_at', 'recorded_by'];
    protected $casts = ['in_at' => 'datetime', 'out_at' => 'datetime', 'created_at' => 'datetime'];

    public function student() { return $this->belongsTo(Student::class); }
    public function hostel() { return $this->belongsTo(Hostel::class); }
}
