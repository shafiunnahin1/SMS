<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffMember extends Model
{
    use BelongsToInstitution, HasFactory;
    use \Illuminate\Database\Eloquent\SoftDeletes;
    public $timestamps = false;
    protected $fillable = ['institution_id', 'user_id', 'employee_id', 'name', 'designation', 'department', 'phone', 'photo', 'joining_date', 'leaving_date', 'status'];
    protected $casts = ['joining_date' => 'date', 'leaving_date' => 'date'];
}
