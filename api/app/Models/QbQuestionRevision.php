<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform-private, PlatformCatalogue with no tenant reads) - docs/modules/question-bank.md §3
class QbQuestionRevision extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'none';   // never read from an institution's host: a writer's edit history (drafts)

    const UPDATED_AT = null;

    protected $fillable = ['qb_question_id', 'snapshot', 'edited_by'];
    protected $casts = ['snapshot' => 'array'];
}
