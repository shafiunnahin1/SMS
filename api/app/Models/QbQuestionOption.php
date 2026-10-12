<?php

namespace App\Models;

use App\Traits\CleansRichText;
use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbQuestionOption extends Model
{
    use PlatformCatalogue, CleansRichText;
    public const RICH_TEXT = ['content_text'];   // D72: qbank's formatting vocabulary only

    public const TENANT_READ = 'all';   // read-only from an institution's host

    public $timestamps = false;

    protected $fillable = ['qb_question_id', 'label', 'content_json', 'content_text', 'is_correct', 'sort_order'];
    protected $casts = ['content_json' => 'array', 'is_correct' => 'boolean'];
}
