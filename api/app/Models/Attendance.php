<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = [
        'institution_id',
        'student_id',
        'program_id',
        'batch_id',
        'date',
        'status',
        'note',
        'taken_by',
    ];

    protected $casts = [
        'date' => 'date',
    ];

    public function student() { return $this->belongsTo(Student::class); }
    public function program() { return $this->belongsTo(Program::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
}
