<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbQuestionType extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    protected $fillable = ['slug', 'name_bn', 'name_en', 'family', 'ui_config', 'is_active', 'sort_order'];
    protected $casts = ['ui_config' => 'array', 'is_active' => 'boolean'];
}
