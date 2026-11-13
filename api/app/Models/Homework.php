<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

// D212 HW.1: one homework for a program (or one batch of it) and a subject
class Homework extends Model
{
    use BelongsToInstitution, SoftDeletes;

    protected $table = 'homeworks';
    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'teacher_id', 'program_id', 'batch_id', 'subject_id', 'title', 'description', 'file_path', 'due_date'];
    protected $casts = ['due_date' => 'date', 'created_at' => 'datetime'];

    public function teacher() { return $this->belongsTo(Teacher::class); }
    public function program() { return $this->belongsTo(Program::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
    public function subject() { return $this->belongsTo(Subject::class); }

    /** the active students it is for */
    public function audience()
    {
        return Student::active()->when($this->batch_id, fn ($q) => $q->inBatch($this->batch_id), fn ($q) => $q->inProgram($this->program_id));
    }
}
