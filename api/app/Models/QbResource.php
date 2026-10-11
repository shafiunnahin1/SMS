<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbResource extends Model
{
    use PlatformCatalogue, SoftDeletes;

    public const TENANT_READ = 'published';   // an institution sees only published content

    protected $fillable = ['kind', 'title_bn', 'title_en', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'qb_media_id', 'page_count', 'status', 'review_note', 'created_by', 'reviewed_by'];
}
