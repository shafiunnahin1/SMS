<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\{Model, Relations\BelongsTo};

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3
class QbPaperItem extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = ['institution_id', 'qb_paper_section_id', 'qb_question_id', 'marks', 'sort_order'];
    protected $casts = ['marks' => 'decimal:2'];

    public function section(): BelongsTo { return $this->belongsTo(QbPaperSection::class, 'qb_paper_section_id'); }
    public function question(): BelongsTo { return $this->belongsTo(QbQuestion::class, 'qb_question_id'); }
}
