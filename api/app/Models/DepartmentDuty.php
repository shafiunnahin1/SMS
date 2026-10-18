<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DepartmentDuty extends Model
{
    use BelongsToInstitution, HasFactory;

    protected $fillable = ['institution_id', 'department_id', 'code', 'name', 'description', 'permission_keys', 'status', 'created_by', 'updated_by'];
    protected $casts = ['permission_keys' => 'array', 'created_at' => 'datetime', 'updated_at' => 'datetime'];
}
