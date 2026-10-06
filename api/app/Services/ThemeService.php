<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Institution;
use App\Models\ThemePreset;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

// docs/modules/institution-branding.md (Layer 1: colours, logo, mode) + docs/THEMING.md (effective theme contract, presets).
// Release 1 edits brand colours, mode and logo only; tokens/layout/pack/preset editing is the R2 theme editor.
class ThemeService
{
    public const DEFAULT_TOKENS = [
        'font_family' => 'hind-siliguri', 'radius' => 'md', 'density' => 'comfortable',
        'card_style' => 'bordered', 'sidebar_style' => 'light', 'table_style' => 'plain',
        'login_template' => 'centered', 'dashboard_variant' => 'cards',
    ];

    public const LAYOUTS = ['sidebar-classic', 'sidebar-mini', 'topnav', 'mobile-compact'];

    public const DEFAULT_BRAND = ['primary_color' => '#185FA5', 'secondary_color' => '#0F6E56', 'accent_color' => '#E67E22', 'theme_mode' => 'light'];

    private const BRAND_FIELDS = ['primary_color', 'secondary_color', 'accent_color', 'theme_mode'];

    /** The fixed contract (docs/THEMING.md "Effective Theme Object"): tokens always carry all eight keys */
    public function getTheme(Institution $i): array
    {
        return Cache::remember("theme:{$i->id}", 3600, function () use ($i) {
            $preset = $i->theme_preset_id ? ThemePreset::find($i->theme_preset_id) : null;
            $typeLayout = config("institution_types.{$i->institution_type}.default_layout");

            $layout = $i->layout_key ?? $preset?->layout_key ?? $typeLayout ?? 'sidebar-classic';
            if (!in_array($layout, self::LAYOUTS, true)) $layout = 'sidebar-classic';
            $primary = $i->primary_color ?? self::DEFAULT_BRAND['primary_color'];

            return [
                'preset_key'      => $preset?->key,
                'layout_key'      => $layout,
                'ui_pack'         => $this->packFor($i, $preset),
                'primary_color'   => $primary,
                'secondary_color' => $i->secondary_color ?? self::DEFAULT_BRAND['secondary_color'],
                'accent_color'    => $i->accent_color ?? self::DEFAULT_BRAND['accent_color'],
                'on_primary'      => $this->onColor($primary),
                'theme_mode'      => $i->theme_mode ?? 'light',
                'logo_url'        => $i->logo_path ? Storage::disk('public')->url($i->logo_path) : null,
                'favicon_url'     => $i->favicon_path ? Storage::disk('public')->url($i->favicon_path) : null,
                'tokens'          => array_merge(self::DEFAULT_TOKENS, $preset?->tokens ?? [], $i->theme_tokens ?? []),
                'white_label'     => app(ModuleGate::class)->feature($i, 'white_label'),
                'updated_at'      => $i->theme_updated_at,
            ];
        });
    }

    /** Central host (no tenant): the platform default, same shape */
    public function defaultTheme(): array
    {
        return [
            'preset_key' => null, 'layout_key' => 'sidebar-classic', 'ui_pack' => 'classic',
            ...array_diff_key(self::DEFAULT_BRAND, ['theme_mode' => 1]),
            'on_primary' => $this->onColor(self::DEFAULT_BRAND['primary_color']),
            'theme_mode' => 'light', 'logo_url' => null, 'favicon_url' => null,
            'tokens' => self::DEFAULT_TOKENS, 'white_label' => false, 'updated_at' => null,
        ];
    }

    /** Known packs come from config/ui_packs.php (Step 3.6); until it exists only `classic` is known */
    public function packFor(Institution $i, ?ThemePreset $preset): string
    {
        $pack = $i->ui_pack ?? $preset?->ui_pack ?? 'classic';
        return array_key_exists($pack, config('ui_packs', ['classic' => []])) ? $pack : 'classic';
    }

    public function update(Institution $i, array $data, int $userId): Institution
    {
        $old = $this->getTheme($i);
        $i->forceFill(array_intersect_key($data, array_flip(self::BRAND_FIELDS)) + ['theme_updated_by' => $userId, 'theme_updated_at' => now()])->save();
        return $this->logAndFlush($i, $old);
    }

    public function uploadLogo(Institution $i, UploadedFile $file, int $userId): string
    {
        $old = $this->getTheme($i);
        if ($i->logo_path) Storage::disk('public')->delete($i->logo_path);
        // docs/architecture/file-storage.md: server UUID name, extension from the sniffed MIME type - never the client's
        $path = $file->storeAs("institutions/{$i->id}/branding", 'logo-' . \Illuminate\Support\Str::uuid() . '.' . $file->extension(), 'public');
        $i->forceFill(['logo_path' => $path, 'theme_updated_by' => $userId, 'theme_updated_at' => now()])->save();
        $this->logAndFlush($i, $old);
        return Storage::disk('public')->url($path);
    }

    /** Signup / demo seeders: copy the preset's brand, clear overrides so the preset's layout and tokens apply */
    public function applyPreset(Institution $i, ThemePreset $preset, ?int $userId = null): Institution
    {
        $allowed = $preset->allowed_types;
        abort_if($allowed && !in_array($i->institution_type, $allowed, true), 422, 'এই থিম এই ধরনের প্রতিষ্ঠানের জন্য নয়');

        $old = $this->getTheme($i);
        $i->forceFill([
            'theme_preset_id' => $preset->id, 'primary_color' => $preset->primary_color, 'secondary_color' => $preset->secondary_color,
            'accent_color' => $preset->accent_color, 'theme_mode' => $preset->theme_mode, 'layout_key' => null, 'ui_pack' => null,
            'theme_tokens' => null, 'theme_updated_by' => $userId, 'theme_updated_at' => now(),
        ])->save();
        return $this->logAndFlush($i, $old);
    }

    public function flush(Institution $i): void
    {
        Cache::forget("theme:{$i->id}");
        Cache::forget("bootstrap:{$i->id}");
    }

    /** institution_theme_logs is not a Release 1 table, so the change goes to audit_logs */
    private function logAndFlush(Institution $i, array $old): Institution
    {
        $this->flush($i);
        $new = $this->getTheme($i);
        $changed = array_keys(array_filter($new, fn ($v, $k) => ($old[$k] ?? null) !== $v && $k !== 'updated_at', ARRAY_FILTER_USE_BOTH));
        if ($changed && auth()->check()) {
            AuditLog::record('theme.updated', $i, ['changed' => $changed, 'old' => array_intersect_key($old, array_flip($changed))]);
        }
        return $i->fresh();
    }

    /** Text colour on the primary colour: dark text on a light primary (relative luminance > 0.5) */
    private function onColor(string $hex): string
    {
        [$r, $g, $b] = array_map(fn ($c) => hexdec($c) / 255, str_split(ltrim($hex, '#'), 2));
        $lin = fn ($c) => $c <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
        $l = 0.2126 * $lin($r) + 0.7152 * $lin($g) + 0.0722 * $lin($b);
        return $l > 0.5 ? '#111827' : '#FFFFFF';
    }
}
