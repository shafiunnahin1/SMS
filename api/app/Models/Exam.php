<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Exam extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = [
        'institution_id',
        'name',
        'program_id',
        'batch_id',
        'exam_type',
        'academic_year',
        'start_date',
        'end_date',
        'status',
        'admit_card_available',
        'admit_card_from',
        'exam_center',
        'admit_card_instructions',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'admit_card_available' => 'boolean',
        'admit_card_from' => 'date',
    ];

    public function program() { return $this->belongsTo(Program::class); }
    public function batch() { return $this->belongsTo(Batch::class); }
}
