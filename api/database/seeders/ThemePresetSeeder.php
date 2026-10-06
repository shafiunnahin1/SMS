<?php

namespace Database\Seeders;

use App\Models\ThemePreset;
use Illuminate\Database\Seeder;

// docs/THEMING.md "Seeded Presets". `tokens` holds only the non-default keys of the token schema; allowed_types NULL = all types.
// Must run BEFORE any institution is created (docs/database/seeders.md).
class ThemePresetSeeder extends Seeder
{
    public function run(): void
    {
        $presets = [
            ['key' => 'classic-blue', 'name' => 'Classic Blue', 'layout_key' => 'sidebar-classic', 'ui_pack' => 'classic',
                'primary_color' => '#185FA5', 'secondary_color' => '#0F6E56', 'accent_color' => '#E67E22',
                'tokens' => [], 'allowed_types' => null, 'is_premium' => false],
            ['key' => 'modern-mint', 'name' => 'Modern Mint', 'layout_key' => 'sidebar-mini', 'ui_pack' => 'fresh',
                'primary_color' => '#0F766E', 'secondary_color' => '#134E4A', 'accent_color' => '#F59E0B',
                'tokens' => ['radius' => 'lg', 'card_style' => 'shadow', 'font_family' => 'anek-bangla'], 'allowed_types' => null, 'is_premium' => false],
            ['key' => 'campus-top', 'name' => 'Campus Top', 'layout_key' => 'topnav', 'ui_pack' => 'classic',
                'primary_color' => '#1E3A8A', 'secondary_color' => '#0F172A', 'accent_color' => '#DC2626',
                'tokens' => ['radius' => 'sm', 'table_style' => 'striped', 'login_template' => 'split'], 'allowed_types' => null, 'is_premium' => false],
            ['key' => 'tutor-lite', 'name' => 'Tutor Lite', 'layout_key' => 'mobile-compact', 'ui_pack' => 'mobile',
                'primary_color' => '#7C3AED', 'secondary_color' => '#4C1D95', 'accent_color' => '#F97316',
                'tokens' => ['radius' => 'xl', 'density' => 'spacious', 'dashboard_variant' => 'compact'], 'allowed_types' => ['private_batch', 'coaching'], 'is_premium' => false],
            ['key' => 'royal-dark', 'name' => 'Royal Dark', 'layout_key' => 'sidebar-classic', 'ui_pack' => 'classic',
                'primary_color' => '#6D28D9', 'secondary_color' => '#1E1B4B', 'accent_color' => '#FBBF24', 'theme_mode' => 'dark',
                'tokens' => ['sidebar_style' => 'dark', 'card_style' => 'flat'], 'allowed_types' => null, 'is_premium' => true],
            ['key' => 'sunrise', 'name' => 'Sunrise', 'layout_key' => 'topnav', 'ui_pack' => 'fresh',
                'primary_color' => '#C2410C', 'secondary_color' => '#7C2D12', 'accent_color' => '#0D9488',
                'tokens' => ['radius' => 'lg', 'font_family' => 'baloo-da-2', 'login_template' => 'cover'], 'allowed_types' => null, 'is_premium' => true],
        ];

        foreach ($presets as $i => $preset) {
            ThemePreset::updateOrCreate(['key' => $preset['key']], $preset + ['theme_mode' => 'light', 'sort_order' => $i + 1, 'is_active' => true]);
        }
    }
}
