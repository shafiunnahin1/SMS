<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D197 AAD.2: one "final result" rule - weighted exams of a class (or batch), its policies, draft -> published (then frozen)
class ResultSheet extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'program_id', 'batch_id', 'academic_year_id', 'name', 'rule', 'status', 'version', 'published_at', 'created_by'];
    protected $casts = ['rule' => 'array', 'published_at' => 'datetime', 'created_at' => 'datetime'];

    public function program() { return $this->belongsTo(Program::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
    public function results() { return $this->hasMany(FinalResult::class); }
}
