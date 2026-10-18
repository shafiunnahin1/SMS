<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbChapterClassLevel extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    public $timestamps = false;

    protected $table = 'qb_chapter_class_level';
    protected $fillable = ['qb_chapter_id', 'qb_class_level_id'];
}
