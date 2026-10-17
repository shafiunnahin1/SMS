<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3
class QbPaperSection extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = ['institution_id', 'qb_paper_id', 'title', 'instruction', 'sort_order'];
}
