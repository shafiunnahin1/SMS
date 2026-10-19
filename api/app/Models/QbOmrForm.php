<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class QbOmrForm extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'qb_paper_id', 'code', 'settings_json', 'layout_version', 'locked_at'];

    protected $casts = [
        'settings_json' => 'array',
        'layout_version' => 'integer',
        'locked_at' => 'datetime',
    ];
}