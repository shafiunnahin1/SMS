<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class ImportJob extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = [
        'institution_id',
        'kind',
        'status',
        'file_path',
        'mapping',
        'summary',
        'created_by',
        'finished_at',
    ];

    protected $casts = [
        'mapping' => 'array',
        'summary' => 'array',
        'finished_at' => 'datetime',
    ];
}
