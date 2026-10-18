<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LeaveType extends Model
{
    use BelongsToInstitution, HasFactory;
    public $timestamps = false;
    protected $fillable = ['institution_id', 'name', 'max_days_per_year', 'is_paid'];
    protected $casts = ['max_days_per_year' => 'integer', 'is_paid' => 'boolean'];
}
