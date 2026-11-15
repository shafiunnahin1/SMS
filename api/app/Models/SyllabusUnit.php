<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D224 SYL.1: chapter -> lesson tree of one program's subject; only leaves count for coverage (syllabus.md section 2 (1))
class SyllabusUnit extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'program_id', 'subject_id', 'parent_id', 'title', 'term', 'planned_periods', 'sort_order'];
    protected $casts = ['planned_periods' => 'integer', 'sort_order' => 'integer'];

    public function children() { return $this->hasMany(self::class, 'parent_id'); }
}
