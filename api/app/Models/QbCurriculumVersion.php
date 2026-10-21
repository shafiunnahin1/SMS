<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

class QbCurriculumVersion extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';

    protected $fillable = ['qb_subject_id', 'version_key', 'name_bn', 'name_en', 'sort_order', 'is_active'];
    protected $casts = ['is_active' => 'boolean'];

    public function subject() { return $this->belongsTo(QbSubject::class, 'qb_subject_id'); }
    public function nodes() { return $this->hasMany(QbCurriculumNode::class, 'qb_curriculum_version_id'); }
    public function classLevels() { return $this->belongsToMany(QbClassLevel::class, 'qb_curriculum_version_class_level', 'qb_curriculum_version_id', 'qb_class_level_id'); }
}
