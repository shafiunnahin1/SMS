<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class BatchTeacher extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'batch_id',
        'teacher_id',
        'subject_id',
        'pay_type',
        'pay_rate',
    ];

    protected $casts = [
        'pay_rate' => 'decimal:2',
    ];

    public function batch() { return $this->belongsTo(Batch::class); }
    public function teacher() { return $this->belongsTo(Teacher::class); }
    public function subject() { return $this->belongsTo(Subject::class); }
}
