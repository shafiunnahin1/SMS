<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbCreativePart extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    public $timestamps = false;

    protected $fillable = ['qb_question_id', 'part_label', 'cognitive_level', 'marks', 'question_json', 'question_text', 'answer_json', 'answer_text', 'sort_order'];
    protected $casts = ['marks' => 'decimal:2', 'question_json' => 'array', 'answer_json' => 'array'];
}
