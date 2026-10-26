<?php

namespace App\Models;

use App\Traits\BelongsToOptionalInstitution;
use Illuminate\Database\Eloquent\Model;

// D166 (6) AI-Q4: one software help article; institution_id NULL = the platform's (approved in the Super Admin panel), else an
// institution's own wording (approved in its admin panel, shown only there)
class AiHelpArticle extends Model
{
    use BelongsToOptionalInstitution;

    protected $fillable = ['institution_id', 'base_article_id', 'slug', 'locale', 'title', 'keywords', 'roles', 'module', 'institution_types', 'body', 'refs',
        'status', 'created_by', 'approved_by', 'approved_at'];
    protected $casts = ['roles' => 'array', 'institution_types' => 'array', 'body' => 'array', 'refs' => 'array', 'approved_at' => 'datetime'];
}
