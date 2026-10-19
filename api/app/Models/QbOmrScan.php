<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QbOmrScan extends Model
{
    use BelongsToInstitution;

    protected $fillable = [
        'institution_id', 'qb_omr_form_id', 'layout_version', 'set_code', 'roll', 'matched_student_id',
        'answers_json', 'answered_count', 'correct_count', 'obtained_marks', 'status', 'comparison_json',
        'image_path', 'source', 'reviewed_by',
    ];

    protected $casts = [
        'layout_version' => 'integer',
        'answers_json' => 'array',
        'answered_count' => 'integer',
        'correct_count' => 'integer',
        'obtained_marks' => 'decimal:2',
        'comparison_json' => 'array',
    ];

    public function form(): BelongsTo
    {
        return $this->belongsTo(QbOmrForm::class, 'qb_omr_form_id');
    }

    public function matchedStudent(): BelongsTo
    {
        return $this->belongsTo(Student::class, 'matched_student_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}