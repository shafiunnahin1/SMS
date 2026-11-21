<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D240 VIS.1: a visitor at the gate; checked out once, corrected the same day by the admin (audited), never deleted. The photo is on
// the private disk and is removed 90 days after the visit (visitors:purge-photos); the phone and ID number never go to a log.
class VisitorLog extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'visitor_name', 'visitor_phone', 'purpose', 'whom_to_meet', 'department', 'id_type', 'id_number', 'check_in', 'check_out', 'badge_no', 'photo', 'created_by'];
    protected $casts = ['check_in' => 'datetime', 'check_out' => 'datetime'];

    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
