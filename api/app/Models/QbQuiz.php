<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbQuiz extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    protected $fillable = ['qb_quiz_package_id', 'access', 'title', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'duration_minutes', 'question_count', 'rule', 'pass_mark', 'opens_at', 'closes_at', 'is_active'];
    protected $casts = ['pass_mark' => 'decimal:2', 'opens_at' => 'datetime', 'closes_at' => 'datetime', 'is_active' => 'boolean'];
}
