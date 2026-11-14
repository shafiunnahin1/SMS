<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D216 RISK.1 (docs/modules/risk-alerts.md): a "needs support" signal for the teacher - never a label shown to the student or parent
class RiskFlag extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    public const KINDS = ['attendance', 'marks_drop', 'dues', 'combined'];

    protected $fillable = ['institution_id', 'student_id', 'batch_id', 'kind', 'level', 'score', 'details', 'status', 'computed_on', 'acknowledged_by', 'note'];

    protected $casts = ['details' => 'array', 'computed_on' => 'date', 'score' => 'decimal:2'];

    public function student() { return $this->belongsTo(Student::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
}
