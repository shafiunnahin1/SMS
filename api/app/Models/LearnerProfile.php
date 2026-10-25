<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D165 (1) ST.1: a self-registered student's own class (one row per student user)
class LearnerProfile extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'user_id', 'qb_class_level_id', 'qb_exam_batch_id'];
}
