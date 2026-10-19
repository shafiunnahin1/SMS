<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D126 (3): one rule of a blueprint - this many questions of a type, optionally a chapter / topic / difficulty, at so many marks each
class QbBlueprintItem extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';

    public $timestamps = false;
    protected $table = 'qb_blueprint_items';
    protected $fillable = ['qb_blueprint_id', 'section_title', 'sort_order', 'qb_question_type_id', 'question_count', 'marks_each', 'qb_chapter_id', 'qb_topic_id', 'difficulty'];
    protected $casts = ['marks_each' => 'decimal:2'];
}
