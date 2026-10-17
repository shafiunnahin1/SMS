<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbChapter extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    protected $fillable = ['qb_subject_id', 'name_bn', 'name_en', 'number', 'sort_order'];

    public function classLevels() { return $this->belongsToMany(QbClassLevel::class, 'qb_chapter_class_level'); }
    public function topics() { return $this->hasMany(QbTopic::class); }
}
