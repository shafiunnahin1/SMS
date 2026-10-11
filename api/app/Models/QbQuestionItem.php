<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbQuestionItem extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    public $timestamps = false;

    protected $fillable = ['qb_question_id', 'qb_question_stimulus_id', 'item_type', 'prompt_json', 'prompt_text', 'answer_json', 'marks', 'sort_order'];
    protected $casts = ['prompt_json' => 'array', 'answer_json' => 'array', 'marks' => 'decimal:2'];
}
