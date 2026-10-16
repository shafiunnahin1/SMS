<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InstitutionDepartment extends Model
{
    use BelongsToInstitution, HasFactory;

    protected $fillable = ['institution_id', 'code', 'name', 'description', 'status', 'created_by', 'updated_by', 'archived_at'];
    protected $casts = ['created_at' => 'datetime', 'updated_at' => 'datetime', 'archived_at' => 'datetime'];
}
