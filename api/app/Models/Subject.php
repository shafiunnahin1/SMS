<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Subject extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'program_id',
        'teacher_id',
        'name',
        'code',
        'full_marks',
        'pass_marks',
        'is_optional',
        'name_alt',
    ];

    protected $casts = [
        'is_optional' => 'boolean',
    ];

    public function program() { return $this->belongsTo(Program::class); }
    public function teacher() { return $this->belongsTo(Teacher::class); }
}
