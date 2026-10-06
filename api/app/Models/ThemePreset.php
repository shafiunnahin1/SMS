<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ThemePreset extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'key',
        'name',
        'description',
        'layout_key',
        'ui_pack',
        'primary_color',
        'secondary_color',
        'accent_color',
        'theme_mode',
        'tokens',
        'preview_image',
        'allowed_types',
        'is_premium',
        'is_active',
        'sort_order',
    ];

    protected $casts = [
        'tokens' => 'array',
        'allowed_types' => 'array',
        'is_premium' => 'boolean',
        'is_active' => 'boolean',
    ];
}
