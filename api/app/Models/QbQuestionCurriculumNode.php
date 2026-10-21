<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

class QbQuestionCurriculumNode extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';
    protected $table = 'qb_question_curriculum_nodes';
    public $timestamps = false;
    public $incrementing = false;
    protected $primaryKey = null;
    protected $fillable = ['qb_question_id', 'qb_curriculum_node_id', 'sort_order'];
}
