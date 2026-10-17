<?php

namespace Tests\Feature\I18n;

use App\Services\InstitutionSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md / I18N.md section 14 "LocaleResolutionTest" with decision D53: user -> remembered choice (the app's bare
// Accept-Language code) -> institution default -> bn; a browser's language list is never used; values outside the enabled list
// are dropped; the central host has only the platform languages; Content-Language says what was used.
class LocaleResolutionTest extends TestCase
{
    use RefreshDatabase, LocaleRequests;

    public function test_the_order_is_user_then_remembered_choice_then_institution_default_then_bn(): void
    {
        $school = $this->makeInstitution('lang');
        $host = $this->hostOf($school);
        $admin = $this->makeUser($school, 'admin');

        $this->req('GET', $host, 'health')->assertHeader('Content-Language', 'bn');                       // nothing set: bn
        $this->req('GET', $host, 'health', null, ['Accept-Language' => 'en'])->assertHeader('Content-Language', 'en');   // remembered
        $admin->forceFill(['locale' => 'bn'])->save();
        $this->req('GET', $host, 'auth/me', $admin, ['Accept-Language' => 'en'])->assertOk()->assertHeader('Content-Language', 'bn');  // user wins
        $admin->forceFill(['locale' => 'en'])->save();
        $this->req('GET', $host, 'notifications', $admin)->assertOk()->assertHeader('Content-Language', 'en');

        $school->forceFill(['settings' => ['locales' => ['bn', 'en'], 'default_locale' => 'en']])->save();
        $this->req('GET', $host, 'health')->assertHeader('Content-Language', 'en');                       // institution default
    }

    public function test_a_browser_language_list_is_not_a_choice_d53(): void
    {
        $school = $this->makeInstitution('lang');
        $res = $this->req('GET', $this->hostOf($school), 'health', null, ['Accept-Language' => 'en-US,en;q=0.9']);
        $res->assertHeader('Content-Language', 'bn');
    }

    public function test_a_language_the_institution_has_not_enabled_is_dropped(): void
    {
        $school = $this->makeInstitution('lang');
        $school->forceFill(['settings' => ['locales' => ['bn']]])->save();
        $user = $this->makeUser($school, 'teacher');
        $user->forceFill(['locale' => 'en'])->save();
        $host = $this->hostOf($school);

        $this->req('GET', $host, 'health', null, ['Accept-Language' => 'en'])->assertHeader('Content-Language', 'bn');
        $this->req('GET', $host, 'auth/me', $user)->assertHeader('Content-Language', 'bn');
        $this->req('GET', $host, 'health', null, ['Accept-Language' => 'ar'])->assertHeader('Content-Language', 'bn');   // not in R1
    }

    public function test_the_central_host_has_only_the_platform_languages(): void
    {
        $central = config('tenancy.central_domains')[0];
        $this->req('GET', $central, 'health', null, ['Accept-Language' => 'en'])->assertHeader('Content-Language', 'en');
        $this->req('GET', $central, 'health', null, ['Accept-Language' => 'ar'])->assertHeader('Content-Language', 'bn');
        $this->assertSame(['bn', 'en'], config('i18n.platform_locales'));
        $this->assertSame(config('i18n.supported'), InstitutionSettings::LOCALES, 'one list of shipped languages');
    }

    public function test_put_auth_locale_saves_the_users_choice_and_refuses_a_language_that_is_not_on(): void
    {
        $school = $this->makeInstitution('lang');
        $user = $this->makeUser($school, 'teacher');
        $host = $this->hostOf($school);

        $this->req('PUT', $host, 'auth/locale', $user, [], ['locale' => 'en'])->assertOk();
        $this->assertSame('en', $user->fresh()->locale);

        $school->forceFill(['settings' => ['locales' => ['bn']]])->save();
        $res = $this->req('PUT', $host, 'auth/locale', $user, [], ['locale' => 'en'])->assertStatus(422);
        $this->assertSame('validation_failed', $res->json('error'));
        $this->assertSame(__('errors.locale_not_enabled', [], 'bn'), $res->json('errors.locale.0'), 'en is off now, so the answer is in bn');
        $this->req('PUT', $host, 'auth/locale', $user, [], ['locale' => 'ar'])->assertStatus(422);
        $this->assertSame('en', $user->fresh()->locale);
    }
}
