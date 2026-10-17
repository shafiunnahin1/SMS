<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\ThemePreset;
use App\Services\ThemeService;
use Database\Seeders\ThemePresetSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

// docs/TESTING.md "ThemePackCompatTest" + docs/UI-PACKS.md section 7/8: a pack only runs on the layouts it lists.
// (R1 has no PUT /admin/theme/pack and no Super Admin theme route - docs/DECISIONS.md, Step 3.6 - so the rule is checked on
// the service every write path goes through.)
class ThemePackCompatTest extends TestCase
{
    use RefreshDatabase;

    private ThemeService $themes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(ThemePresetSeeder::class);
        $this->themes = app(ThemeService::class);
    }

    public function test_an_incompatible_layout_and_pack_is_a_422(): void
    {
        try {
            $this->themes->assertCompatible('sidebar-classic', 'mobile');
            $this->fail('mobile + sidebar-classic must be refused');
        } catch (ValidationException $e) {
            $this->assertSame(422, $e->status);
            $this->assertArrayHasKey('ui_pack', $e->errors());
        }
        $this->themes->assertCompatible('mobile-compact', 'mobile');
        foreach (ThemeService::LAYOUTS as $layout) $this->themes->assertCompatible($layout, 'classic');
        $this->expectException(ValidationException::class);
        $this->themes->assertCompatible('topnav', 'no-such-pack');
    }

    public function test_apply_preset_refuses_a_preset_whose_pair_does_not_fit_and_changes_nothing(): void
    {
        $i = $this->makeInstitution('compat', 'coaching');
        $bad = ThemePreset::create(['key' => 'bad-pair', 'name' => 'Bad', 'layout_key' => 'topnav', 'ui_pack' => 'mobile',
            'primary_color' => '#111111', 'secondary_color' => '#222222', 'accent_color' => '#333333', 'theme_mode' => 'light',
            'tokens' => [], 'is_active' => true, 'sort_order' => 99]);
        try {
            $this->themes->applyPreset($i, $bad);
            $this->fail('the preset should be refused');
        } catch (ValidationException $e) {
            $this->assertSame(422, $e->status);
        }
        $this->assertNull($i->fresh()->theme_preset_id);
    }

    public function test_apply_preset_clears_the_institution_pack_so_the_presets_applies(): void
    {
        $i = $this->makeInstitution('compat', 'private_batch');
        $i->forceFill(['ui_pack' => 'classic', 'layout_key' => 'topnav'])->save();
        $this->themes->applyPreset($i, ThemePreset::where('key', 'tutor-lite')->firstOrFail());
        $this->assertNull($i->fresh()->ui_pack);
        $theme = $this->themes->getTheme($i->fresh());
        $this->assertSame(['mobile-compact', 'mobile'], [$theme['layout_key'], $theme['ui_pack']]);
    }

    public function test_every_seeded_preset_is_a_valid_pair(): void
    {
        foreach (ThemePreset::all() as $preset) {
            $pack = $this->themes->packFor(new Institution(), $preset);
            $this->themes->assertCompatible($preset->layout_key, $pack);
        }
        $this->assertGreaterThan(0, ThemePreset::count());
    }

    public function test_the_effective_theme_always_has_a_pack_and_a_stored_misfit_reads_as_classic(): void
    {
        $tutor = ThemePreset::where('key', 'tutor-lite')->firstOrFail();
        foreach (['school', 'college', 'coaching', 'private_batch'] as $type) {
            $this->assertArrayHasKey('ui_pack', $this->themes->getTheme($this->makeInstitution("p{$type}", $type)));
        }
        $i = $this->makeInstitution('misfit', 'coaching');
        $i->forceFill(['theme_preset_id' => $tutor->id, 'layout_key' => 'sidebar-classic'])->save();   // layout override after a mobile preset
        $this->assertSame('classic', $this->themes->getTheme($i->fresh())['ui_pack'], 'never a mobile view inside a sidebar shell');
    }

    public function test_config_lists_classic_on_every_layout(): void
    {
        $this->assertEqualsCanonicalizing(ThemeService::LAYOUTS, config('ui_packs.classic.layouts'));
        foreach (config('ui_packs') as $key => $pack) {
            $this->assertNotEmpty($pack['layouts'], $key);
            $this->assertSame([], array_diff($pack['layouts'], ThemeService::LAYOUTS), "{$key} lists an unknown layout");
        }
    }
}
