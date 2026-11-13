<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D205 PERM.1: one teacher's exception to the institution's teacher feature switches - `blocked` (off for this teacher) or
// `allowed` (back on for this teacher where the institution switched it off). A switch only ever takes away.
class TeacherFeatureOverride extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'user_id', 'feature_key', 'state', 'set_by'];
}
