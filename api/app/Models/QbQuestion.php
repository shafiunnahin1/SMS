<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbQuestion extends Model
{
    use PlatformCatalogue, SoftDeletes;

    public const TENANT_READ = 'published';   // an institution sees only published content

    protected $fillable = ['qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'difficulty', 'marks', 'language', 'content_mode', 'question_json', 'question_text', 'answer_json', 'answer_text', 'explanation_json', 'explanation_text', 'status', 'review_note', 'created_by', 'reviewed_by', 'published_at', 'sort_order'];
    protected $casts = ['marks' => 'decimal:2', 'question_json' => 'array', 'answer_json' => 'array', 'explanation_json' => 'array', 'published_at' => 'datetime'];
}
