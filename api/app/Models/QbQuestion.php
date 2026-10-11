<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbQuestion extends Model
{
    use PlatformCatalogue, SoftDeletes;

    public const TENANT_READ = 'published';   // an institution sees only published content

    protected $fillable = ['qb_question_type_id', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'difficulty', 'marks', 'language', 'content_mode', 'question_json', 'question_text', 'answer_json', 'answer_text', 'explanation_json', 'explanation_text', 'status', 'review_note', 'created_by', 'reviewed_by', 'published_at', 'sort_order'];
    protected $casts = ['marks' => 'decimal:2', 'question_json' => 'array', 'answer_json' => 'array', 'explanation_json' => 'array', 'published_at' => 'datetime'];

    public function classLevels() { return $this->belongsToMany(QbClassLevel::class, 'qb_question_class_level'); }

    public function type() { return $this->belongsTo(QbQuestionType::class, 'qb_question_type_id'); }
    public function options() { return $this->hasMany(QbQuestionOption::class)->orderBy('sort_order')->orderBy('id'); }
    public function creativeParts() { return $this->hasMany(QbCreativePart::class)->orderBy('sort_order')->orderBy('id'); }
    public function occurrences() { return $this->hasMany(QbQuestionOccurrence::class)->orderBy('id'); }
    /** pictures linked to the question itself (qb_media_links owner_type 'question') */
    public function media() { return $this->belongsToMany(QbMedia::class, 'qb_media_links', 'owner_id', 'qb_media_id')->wherePivot('owner_type', 'question')->withPivotValue('owner_type', 'question'); }

    /** QB.4 structured types: a passage / word box / table, and the gaps, pairs, steps or sub-questions */
    public function stimuli() { return $this->hasMany(QbQuestionStimulus::class)->orderBy('sort_order')->orderBy('id'); }
    public function items() { return $this->hasMany(QbQuestionItem::class)->orderBy('sort_order')->orderBy('id'); }
}
