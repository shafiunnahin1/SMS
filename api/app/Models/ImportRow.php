<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class ImportRow extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'job_id',
        'row_no',
        'status',
        'error',
        'data',
        'created_table',
        'created_id',
    ];

    protected $casts = [
        'data' => 'array',
    ];

    public function job() { return $this->belongsTo(ImportJob::class); }
}
