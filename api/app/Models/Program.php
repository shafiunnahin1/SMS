<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Program extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = [
        'institution_id',
        'name',
        'numeric_name',
        'code',
        'group_name',
        'duration_months',
        'course_fee',
        'is_default',
        'is_active',
        'is_public',
        'public_description',
        'sort_order',
        'name_alt',
        'qb_class_level_id',
    ];

    protected $casts = [
        'course_fee' => 'decimal:2',
        'is_default' => 'boolean',
        'is_active' => 'boolean',
        'is_public' => 'boolean',
    ];

    public function batches() { return $this->hasMany(Batch::class); }
}
