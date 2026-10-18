<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3
class QbQuestionOccurrence extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    public $timestamps = false;

    protected $fillable = ['qb_question_id', 'board', 'institution_name', 'exam_type', 'year', 'note'];
}
