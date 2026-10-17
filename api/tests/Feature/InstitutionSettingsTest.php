<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Institution;
use Database\Seeders\PlanSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// Step 2.4 admin routes: /settings, /admin/settings/general, /admin/settings/language, /admin/theme(/logo)
class InstitutionSettingsTest extends TestCase
{
    use RefreshDatabase;

    private Institution $school;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PlanSeeder::class);
        $this->school = $this->makeInstitution('dhanmondi');
    }

    private array $users = [];

    private function as(string $method, string $path, array $data = [], string $role = 'admin')
    {
        $this->users[$role] ??= $this->makeUser($this->school, $role);
        return $this->api($method, $this->hostOf($this->school), $path, $this->users[$role], $data);
    }

    public function test_the_profile_can_be_read_and_changed_but_not_its_slug_or_type(): void
    {
        $this->as('GET', 'settings')->assertOk()->assertJsonPath('data.slug', 'dhanmondi');
        $this->as('PUT', 'settings', ['name' => 'Dhanmondi High School', 'phone' => '01712345678', 'slug' => 'hacked', 'institution_type' => 'coaching'])
            ->assertOk()->assertJsonPath('data.name', 'Dhanmondi High School');

        $fresh = $this->school->fresh();
        $this->assertSame(['dhanmondi', 'school'], [$fresh->slug, $fresh->institution_type]);
        $this->as('PUT', 'settings', ['email' => 'not-an-email'])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_general_settings_are_validated_and_stored_in_settings_json(): void
    {
        $this->as('PUT', 'admin/settings/general', ['fee_proration' => 'half_after_15', 'use_programs' => false])->assertOk()
            ->assertJson(['data' => ['fee_proration' => 'half_after_15', 'use_programs' => false, 'use_gpa' => true]]);
        $this->assertSame('half_after_15', $this->school->fresh()->settings['fee_proration']);
        $this->as('PUT', 'admin/settings/general', ['fee_proration' => 'quarter'])->assertStatus(422);
    }

    public function test_bengali_cannot_be_switched_off_and_default_must_be_enabled(): void
    {
        $this->as('GET', 'admin/settings/language')->assertOk()->assertJson(['data' => ['enabled' => ['bn', 'en'], 'default' => 'bn']]);

        $this->as('PUT', 'admin/settings/language', ['enabled' => ['en'], 'default' => 'en'])->assertStatus(422)->assertJsonValidationErrors(['enabled']);
        $this->as('PUT', 'admin/settings/language', ['enabled' => ['bn'], 'default' => 'en'])->assertStatus(422)->assertJsonValidationErrors(['default']);
        $this->as('PUT', 'admin/settings/language', ['enabled' => ['bn', 'ar'], 'default' => 'bn'])->assertStatus(422);
        $this->as('PUT', 'admin/settings/language', ['enabled' => ['bn', 'en'], 'default' => 'en', 'sms_locale' => 'bn'])->assertOk()
            ->assertJson(['data' => ['enabled' => ['bn', 'en'], 'default' => 'en', 'sms_locale' => 'bn']]);
        $this->api('GET', $this->hostOf($this->school), 'bootstrap')->assertJsonPath('data.locales.default', 'en');
    }

    public function test_brand_colours_need_custom_branding_but_the_logo_does_not(): void
    {
        Storage::fake('public');
        $this->as('PUT', 'admin/theme', ['primary_color' => '#0F766E'])->assertForbidden()->assertJson(['error' => 'feature_not_available']);
        $this->as('GET', 'admin/theme')->assertOk()->assertJsonPath('data.can_customize', false);

        $logo = $this->as('POST', 'admin/theme/logo', ['logo' => UploadedFile::fake()->image('logo.png', 200, 200)])->assertOk()->json('data.logo_url');
        $path = $this->school->fresh()->logo_path;
        $this->assertStringStartsWith("institutions/{$this->school->id}/branding/", $path);
        Storage::disk('public')->assertExists($path);
        $this->assertNotNull($logo);

        $this->school->forceFill(['enabled_modules' => ['custom_branding' => true]])->save();
        $this->as('PUT', 'admin/theme', ['primary_color' => '#0F766E', 'theme_mode' => 'dark'])->assertOk()
            ->assertJsonPath('data.theme.primary_color', '#0F766E')->assertJsonPath('data.theme.theme_mode', 'dark');
        $this->assertTrue($this->asTenant($this->school, fn () => AuditLog::where('action', 'theme.updated')->exists()));
        $this->as('PUT', 'admin/theme', ['primary_color' => 'blue'])->assertStatus(422);
    }

    public function test_a_replaced_logo_is_deleted_and_svg_or_large_files_are_refused(): void
    {
        Storage::fake('public');
        $this->as('POST', 'admin/theme/logo', ['logo' => UploadedFile::fake()->image('a.png')])->assertOk();
        $first = $this->school->fresh()->logo_path;
        $this->as('POST', 'admin/theme/logo', ['logo' => UploadedFile::fake()->image('b.png')])->assertOk();

        Storage::disk('public')->assertMissing($first);
        $this->as('POST', 'admin/theme/logo', ['logo' => UploadedFile::fake()->create('x.svg', 10, 'image/svg+xml')])->assertStatus(422);
        $this->as('POST', 'admin/theme/logo', ['logo' => UploadedFile::fake()->image('big.png')->size(2048)])->assertStatus(422);
    }

    public function test_only_this_institutions_admin_reaches_settings(): void
    {
        foreach (['settings', 'admin/settings/general', 'admin/settings/language', 'admin/theme'] as $path) {
            $this->as('GET', $path, [], 'teacher')->assertForbidden()->assertJson(['error' => 'forbidden']);
            $this->users['admin'] ??= $this->makeUser($this->school, 'admin');
            $this->api('GET', $this->hostOf($this->makeInstitution('o' . uniqid())), $path, $this->users['admin'])
                ->assertForbidden()->assertJson(['error' => 'institution_mismatch']);
        }
    }
}
