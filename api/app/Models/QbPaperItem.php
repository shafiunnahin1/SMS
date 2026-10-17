<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3
class QbPaperItem extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = ['institution_id', 'qb_paper_section_id', 'qb_question_id', 'marks', 'sort_order'];
    protected $casts = ['marks' => 'decimal:2'];
}
