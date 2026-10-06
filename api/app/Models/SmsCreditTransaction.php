<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class SmsCreditTransaction extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = [
        'institution_id',
        'type',
        'quantity',
        'balance_after',
        'reference',
        'created_by',
    ];
}
