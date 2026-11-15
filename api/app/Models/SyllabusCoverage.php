<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D224 SYL.1: one unit covered in one batch (unique per batch and unit)
class SyllabusCoverage extends Model
{
    use BelongsToInstitution;

    protected $table = 'syllabus_coverage';
    public $timestamps = false;
    protected $fillable = ['institution_id', 'batch_id', 'unit_id', 'teacher_id', 'covered_on', 'note'];
    protected $casts = ['covered_on' => 'date:Y-m-d'];
}
