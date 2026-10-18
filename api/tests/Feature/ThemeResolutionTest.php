<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\ThemePreset;
use App\Rules\ThemeTokensRule;
use App\Services\ThemeService;
use Database\Seeders\ThemePresetSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

// docs/THEMING.md "Resolution Order" + "Effective Theme Object"
class ThemeResolutionTest extends TestCase
{
    use RefreshDatabase;

    private ThemeService $themes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ThemePresetSeeder::class);
        $this->themes = app(ThemeService::class);
    }

    private function inst(string $type, array $attrs = []): Institution
    {
        $i = $this->makeInstitution('t' . uniqid(), $type);
        $i->forceFill($attrs)->save();
        return $i->fresh();
    }

    public function test_the_theme_always_has_the_fixed_shape_and_all_eight_tokens(): void
    {
        $theme = $this->themes->getTheme($this->inst('school'));

        $this->assertSame(['preset_key', 'layout_key', 'ui_pack', 'primary_color', 'secondary_color', 'accent_color', 'on_primary', 'theme_mode',
            'logo_url', 'favicon_url', 'tokens', 'white_label', 'updated_at'], array_keys($theme));
        $this->assertSame(array_keys(ThemeService::DEFAULT_TOKENS), array_keys($theme['tokens']));
        $this->assertSame(array_keys(ThemeService::DEFAULT_TOKENS), array_keys($this->themes->defaultTheme()['tokens']));
    }

    public function test_layout_comes_from_institution_then_preset_then_type(): void
    {
        $this->assertSame('sidebar-mini', $this->themes->getTheme($this->inst('coaching'))['layout_key'], 'type default');
        $this->assertSame('mobile-compact', $this->themes->getTheme($this->inst('private_batch'))['layout_key']);

        $campus = ThemePreset::where('key', 'campus-top')->first();
        $this->assertSame('topnav', $this->themes->getTheme($this->inst('coaching', ['theme_preset_id' => $campus->id]))['layout_key'], 'preset beats type');
        $this->assertSame('sidebar-classic', $this->themes->getTheme($this->inst('coaching', ['theme_preset_id' => $campus->id, 'layout_key' => 'sidebar-classic']))['layout_key'], 'institution beats preset');
        $this->assertSame('sidebar-classic', $this->themes->getTheme($this->inst('school', ['layout_key' => 'no-such-layout']))['layout_key'], 'unknown layout falls back');
    }

    public function test_tokens_merge_default_then_preset_then_institution_per_key(): void
    {
        $mint = ThemePreset::where('key', 'modern-mint')->first();   // radius lg, card_style shadow, font anek-bangla
        $i = $this->inst('coaching', ['theme_preset_id' => $mint->id, 'theme_tokens' => ['radius' => 'sm']]);

        $t = $this->themes->getTheme($i)['tokens'];
        $this->assertSame('sm', $t['radius'], 'institution wins');
        $this->assertSame('shadow', $t['card_style'], 'preset fills what the institution did not set');
        $this->assertSame('anek-bangla', $t['font_family']);
        $this->assertSame('comfortable', $t['density'], 'default fills the rest');
    }

    public function test_an_unknown_ui_pack_is_classic(): void
    {
        $fresh = ThemePreset::where('key', 'modern-mint')->first();   // ui_pack fresh: not shipped before Step 3.6
        $this->assertSame('classic', $this->themes->getTheme($this->inst('school', ['theme_preset_id' => $fresh->id]))['ui_pack']);
        $this->assertSame('classic', $this->themes->getTheme($this->inst('school', ['ui_pack' => 'nonsense']))['ui_pack']);
    }

    public function test_on_primary_is_dark_on_light_colours_and_white_on_dark_ones(): void
    {
        $this->assertSame('#FFFFFF', $this->themes->getTheme($this->inst('school', ['primary_color' => '#185FA5']))['on_primary']);
        $this->assertSame('#111827', $this->themes->getTheme($this->inst('school', ['primary_color' => '#FDE68A']))['on_primary']);
    }

    public function test_apply_preset_copies_the_brand_clears_overrides_and_respects_allowed_types(): void
    {
        $tutor = ThemePreset::where('key', 'tutor-lite')->first();     // allowed: private_batch, coaching
        $i = $this->inst('coaching', ['layout_key' => 'topnav', 'theme_tokens' => ['radius' => 'none']]);

        $this->themes->applyPreset($i, $tutor);
        $theme = $this->themes->getTheme($i->fresh());
        $this->assertSame(['tutor-lite', 'mobile-compact', '#7C3AED', 'xl'], [$theme['preset_key'], $theme['layout_key'], $theme['primary_color'], $theme['tokens']['radius']]);

        $this->expectException(HttpException::class);
        $this->themes->applyPreset($this->inst('school'), $tutor);
    }

    public function test_the_token_rule_accepts_only_known_keys_and_values(): void
    {
        $ok = fn ($tokens) => Validator::make(['t' => $tokens], ['t' => [new ThemeTokensRule]])->passes();

        $this->assertTrue($ok(['radius' => 'lg', 'font_family' => 'inter']));
        $this->assertFalse($ok(['radius' => 'huge']));
        $this->assertFalse($ok(['colour' => 'red']));
        $this->assertFalse($ok('lg'));
        foreach (ThemePreset::all() as $preset) $this->assertTrue($ok($preset->tokens), "seeded preset {$preset->key} has invalid tokens");
    }
}
