<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbQuizPackage extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    protected $fillable = ['title', 'qb_class_level_id', 'qb_subject_id', 'description', 'validity_days', 'is_active'];
    protected $casts = ['is_active' => 'boolean'];
}
