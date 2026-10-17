<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'title',
        'date',
        'type',
        'description',
    ];

    protected $casts = [
        'date' => 'date',
    ];
}
