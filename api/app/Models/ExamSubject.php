<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class ExamSubject extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'exam_id',
        'subject_id',
        'full_marks',
        'pass_marks',
        'exam_date',
        'start_time',
        'end_time',
        'room',
        'components',
        'sort_order',
        'entry_deadline',
        'locked_at',
        'locked_by',
    ];

    protected $casts = [
        'full_marks' => 'decimal:2',
        'pass_marks' => 'decimal:2',
        'exam_date' => 'date',
        'components' => 'array',
        'entry_deadline' => 'datetime',
        'locked_at' => 'datetime',
    ];

    public function exam() { return $this->belongsTo(Exam::class); }
    public function subject() { return $this->belongsTo(Subject::class); }
}
