<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbSubject extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    protected $fillable = ['name_bn', 'name_en', 'code', 'sort_order', 'is_active'];
    protected $casts = ['is_active' => 'boolean'];

    public function classLevels() { return $this->belongsToMany(QbClassLevel::class, 'qb_class_level_subject'); }
    public function chapters() { return $this->hasMany(QbChapter::class); }
}
