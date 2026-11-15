<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D224 SYL.1: planned -> taught (covers its unit once) | skipped
class LessonPlan extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'batch_id', 'subject_id', 'teacher_id', 'unit_id', 'planned_date', 'objective', 'activities', 'resources', 'status'];
    protected $casts = ['planned_date' => 'date:Y-m-d', 'created_at' => 'datetime'];
}
