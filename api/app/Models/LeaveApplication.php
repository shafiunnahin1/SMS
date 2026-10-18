<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LeaveApplication extends Model
{
    use BelongsToInstitution, HasFactory;
    public $timestamps = false;
    protected $fillable = ['institution_id', 'user_id', 'staff_id', 'leave_type_id', 'from_date', 'to_date', 'total_days', 'reason', 'status', 'approved_by'];
    protected $casts = ['from_date' => 'date', 'to_date' => 'date', 'total_days' => 'integer'];
}
