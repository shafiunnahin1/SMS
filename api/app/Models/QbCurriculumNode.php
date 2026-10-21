<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

class QbCurriculumNode extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';
    public const KINDS = ['Part', 'Unit', 'Lesson', 'Text', 'Topic', 'Other'];

    protected $fillable = ['qb_curriculum_version_id', 'parent_id', 'kind', 'name_bn', 'name_en', 'sort_order', 'legacy_qb_chapter_id', 'legacy_qb_topic_id'];

    public function version() { return $this->belongsTo(QbCurriculumVersion::class, 'qb_curriculum_version_id'); }
    public function parent() { return $this->belongsTo(self::class, 'parent_id'); }
    public function children() { return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order')->orderBy('id'); }
    public function questionLinks() { return $this->hasMany(QbQuestionCurriculumNode::class, 'qb_curriculum_node_id'); }
    public function legacyChapter() { return $this->belongsTo(QbChapter::class, 'legacy_qb_chapter_id'); }
    public function legacyTopic() { return $this->belongsTo(QbTopic::class, 'legacy_qb_topic_id'); }
}
