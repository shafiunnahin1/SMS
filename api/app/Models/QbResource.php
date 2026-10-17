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

    /** QB.5: the PDF itself (private disk) */
    public function file() { return $this->belongsTo(QbMedia::class, 'qb_media_id'); }

    /** QB.5: the preview pages - pictures of the first pages that any institution may see (qb_media_links owner_type resource) */
    public function previews() { return $this->belongsToMany(QbMedia::class, 'qb_media_links', 'owner_id', 'qb_media_id')->wherePivot('owner_type', 'resource')->withPivotValue('owner_type', 'resource')->orderBy('qb_media_links.id'); }
}
