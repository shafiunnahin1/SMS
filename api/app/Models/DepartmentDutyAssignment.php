<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DepartmentDutyAssignment extends Model
{
    use BelongsToInstitution, HasFactory;

    protected $fillable = ['institution_id', 'membership_id', 'duty_id', 'status', 'assigned_by', 'revoked_by', 'assigned_at', 'revoked_at'];
    public $timestamps = false;
    protected $casts = ['assigned_at' => 'datetime', 'revoked_at' => 'datetime'];
}
