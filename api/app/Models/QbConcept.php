<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbConcept extends Model
{
    use PlatformCatalogue, SoftDeletes;

    public const TENANT_READ = 'published';   // an institution sees only published content

    protected $fillable = ['qb_topic_id', 'title_bn', 'title_en', 'body_json', 'body_text', 'status', 'review_note', 'created_by', 'reviewed_by', 'sort_order'];
    protected $casts = ['body_json' => 'array'];
}
