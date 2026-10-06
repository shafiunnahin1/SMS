<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class FeeCategory extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'name',
        'amount',
        'frequency',
        'applicable_to',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
    ];
}
