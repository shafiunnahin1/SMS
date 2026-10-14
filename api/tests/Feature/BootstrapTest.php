<?php

namespace Tests\Feature;

use App\Models\Institution;
use App\Models\User;
use Database\Seeders\PlanSeeder;
use Database\Seeders\ThemePresetSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Step 2.4 Done When: /bootstrap on a tenant host gives terms, modules, theme (8 tokens); on the central host is_central: true.
// Also docs/modules/public-website.md "BootstrapWhitelistTest".
class BootstrapTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PlanSeeder::class, ThemePresetSeeder::class]);
    }

    public function test_a_tenant_host_gets_terms_modules_and_a_full_theme(): void
    {
        $coaching = $this->makeInstitution('alokito-coaching', 'coaching');

        $res = $this->api('GET', 'alokito-coaching.schoolapp.com', 'bootstrap')->assertOk()
            ->assertJsonPath('data.is_central', false)
            ->assertJsonPath('data.institution.slug', 'alokito-coaching')
            ->assertJsonPath('data.terms.batch.bn', 'ব্যাচ')
            ->assertJsonPath('data.theme.layout_key', 'sidebar-mini')
            ->assertJsonPath('data.release.id', 'R3');

        $this->assertCount(8, $res->json('data.theme.tokens'));
        $this->assertEqualsCanonicalizing(array_values(array_diff(config('release.modules'), ['donations'])), $res->json('data.modules'), 'D80: coaching gets every R3 module except opt-in donations');
        $this->assertContains('student', $res->json('data.roles'), 'D68: R1 ships student login for the question-bank portal');
        $this->assertSame(['bn', 'en'], $res->json('data.locales.enabled'));

        $optedCoaching = $this->makeInstitution('opted-coaching', 'coaching');
        $optedCoaching->update(['settings' => ['opt_in_modules' => ['donations']]]);
        $optedIn = $this->api('GET', $this->hostOf($optedCoaching), 'bootstrap')->assertOk();
        $this->assertEqualsCanonicalizing(config('release.modules'), $optedIn->json('data.modules'));
    }

    public function test_private_batch_type_excludes_d80_modules(): void
    {
        $this->makeInstitution('private-r3', 'private_batch');
        $res = $this->api('GET', 'private-r3.schoolapp.com', 'bootstrap')->assertOk();
        $this->assertNotContains('teacher_attendance', config('institution_types.private_batch.modules'));
        $this->assertNotContains('donations', config('institution_types.private_batch.modules'));
        $this->assertNotContains('teacher_attendance', $res->json('data.modules'));
        $this->assertNotContains('donations', $res->json('data.modules'));
    }

    public function test_the_central_host_says_is_central_with_the_platform_theme(): void
    {
        $this->api('GET', 'admin.schoolapp.com', 'bootstrap')->assertOk()
            ->assertJsonPath('data.is_central', true)
            ->assertJsonPath('data.theme.primary_color', '#185FA5')
            ->assertJsonCount(8, 'data.theme.tokens')
            ->assertJsonMissingPath('data.institution');
    }

    public function test_unknown_hosts_are_404(): void
    {
        $this->api('GET', 'nobody.schoolapp.com', 'bootstrap')->assertNotFound()->assertJson(['error' => 'institution_not_found']);
    }

    public function test_settings_are_an_allow_list_never_secrets(): void
    {
        $i = $this->makeInstitution('dhanmondi');
        $i->forceFill(['settings' => [
            'use_gpa' => true, 'fee_proration' => 'half_after_15', 'public_site' => ['enabled' => true, 'headline' => 'x'],
            'platform_collect' => true, 'platform_fee_percent' => 2, 'payment' => ['bkash_secret' => 's3cr3t'], 'sms_sender' => 'SECRET',
        ]])->save();

        $settings = $this->api('GET', $this->hostOf($i), 'bootstrap')->assertOk()->json('data.settings');

        $this->assertSame(['fee_proration', 'use_programs', 'student_portal', 'use_gpa', 'public_site'], array_keys($settings));
        $this->assertSame(['enabled' => true], $settings['public_site']);
        $this->assertStringNotContainsString('s3cr3t', json_encode($settings));
    }

    public function test_type_defaults_for_general_settings(): void
    {
        $tutor = $this->makeInstitution('tutor', 'private_batch');
        $school = $this->makeInstitution('school');

        $this->assertSame(['fee_proration' => 'none', 'use_programs' => false, 'student_portal' => false, 'use_gpa' => false, 'public_site' => ['enabled' => false]],
            $this->api('GET', $this->hostOf($tutor), 'bootstrap')->json('data.settings'));
        $this->assertTrue($this->api('GET', $this->hostOf($school), 'bootstrap')->json('data.settings.use_gpa'));
    }

    public function test_changes_by_the_admin_show_up_at_once_despite_the_cache(): void
    {
        $i = $this->makeInstitution('dhanmondi');
        $i->forceFill(['enabled_modules' => ['custom_branding' => true]])->save();
        $admin = $this->makeUser($i, 'admin');
        $this->api('GET', $this->hostOf($i), 'bootstrap')->assertJsonPath('data.terms.program.bn', 'শ্রেণি');   // fills the cache

        $this->api('PUT', $this->hostOf($i), 'admin/settings/terminology', $admin, ['terminology' => ['program' => ['bn' => 'জামাত']]])->assertOk();
        $this->api('PUT', $this->hostOf($i), 'admin/theme', $admin, ['primary_color' => '#0F766E'])->assertOk();
        $this->api('PUT', $this->hostOf($i), 'admin/settings/general', $admin, ['use_gpa' => false])->assertOk();

        $this->api('GET', $this->hostOf($i), 'bootstrap')->assertJsonPath('data.terms.program.bn', 'জামাত')
            ->assertJsonPath('data.theme.primary_color', '#0F766E')->assertJsonPath('data.settings.use_gpa', false);
    }

    public function test_a_suspended_institution_still_gets_its_bootstrap(): void
    {
        $i = $this->makeInstitution('late', 'school', 'suspended');
        $this->api('GET', $this->hostOf($i), 'bootstrap')->assertOk()->assertJsonPath('data.institution.status', 'suspended');
    }
}
