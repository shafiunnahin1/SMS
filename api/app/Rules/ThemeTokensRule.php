<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

// docs/THEMING.md "Token Schema": every key must be known and every value from its allowed set
class ThemeTokensRule implements ValidationRule
{
    public const ALLOWED = [
        'font_family'       => ['hind-siliguri', 'noto-sans-bengali', 'baloo-da-2', 'anek-bangla', 'inter'],
        'radius'            => ['none', 'sm', 'md', 'lg', 'xl'],
        'density'           => ['compact', 'comfortable', 'spacious'],
        'card_style'        => ['flat', 'bordered', 'shadow'],
        'sidebar_style'     => ['light', 'dark', 'brand'],
        'table_style'       => ['plain', 'striped'],
        'login_template'    => ['centered', 'split', 'cover'],
        'dashboard_variant' => ['cards', 'compact'],
    ];

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!is_array($value)) { $fail('Tokens must be an object.'); return; }
        foreach ($value as $key => $v) {
            if (!array_key_exists($key, self::ALLOWED)) { $fail("Unknown theme token {$key}."); return; }
            if (!in_array($v, self::ALLOWED[$key], true)) { $fail("Invalid value for theme token {$key}."); return; }
        }
    }
}
