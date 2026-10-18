<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class DepartmentMembership extends Model
{
    use BelongsToInstitution, HasFactory;

    protected $fillable = ['institution_id', 'department_id', 'user_id', 'status', 'starts_at', 'ends_at', 'created_by'];
    protected $casts = ['starts_at' => 'date', 'ends_at' => 'date', 'created_at' => 'datetime', 'updated_at' => 'datetime'];
}
