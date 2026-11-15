<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D223 TPO.1: draft -> approved -> paid; a paid row is never changed or deleted (D32) - a correction goes on a later month's draft
class TeacherPayout extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'teacher_id', 'batch_id', 'month', 'classes_taken', 'collection_base', 'amount', 'status', 'paid_at', 'note'];
    protected $casts = ['collection_base' => 'decimal:2', 'amount' => 'decimal:2', 'classes_taken' => 'integer', 'paid_at' => 'datetime', 'created_at' => 'datetime'];

    public function teacher() { return $this->belongsTo(Teacher::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
}
