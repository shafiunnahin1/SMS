<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SubscriptionPlan extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'name',
        'price',
        'duration_days',
        'max_students',
        'max_teachers',
        'max_sms',
        'institution_type',
        'max_batches',
        'sort_order',
        'features',
        'is_active',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'features' => 'array',
        'is_active' => 'boolean',
    ];
}
