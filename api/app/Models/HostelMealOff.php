<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.3: a meal a mess member did not take
class HostelMealOff extends Model
{
    use BelongsToInstitution;

    protected $table = 'hostel_meal_offs';
    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'hostel_id', 'student_id', 'date', 'meal', 'marked_by'];
    protected $casts = ['date' => 'date:Y-m-d', 'created_at' => 'datetime'];
}
