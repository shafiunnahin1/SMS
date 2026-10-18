<?php

namespace Tests\Feature\I18n;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/I18N.md section 14 "LanguageSettingsTest" (R1: bn + en; the madrasa preset is Arabic content - a later release):
// bn can never be switched off; default and sms_locale must be enabled; the change reaches /bootstrap and the API language.
class LanguageSettingsTest extends TestCase
{
    use RefreshDatabase, LocaleRequests;

    public function test_bengali_stays_on_and_default_and_sms_language_must_be_enabled(): void
    {
        $i = $this->makeInstitution('langset');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);

        $res = $this->req('PUT', $host, 'admin/settings/language', $admin, ['Accept-Language' => 'en'], ['enabled' => ['en'], 'default' => 'en'])->assertStatus(422);
        $this->assertSame(__('errors.bn_required', [], 'en'), $res->json('errors.enabled.0'));
        $this->req('PUT', $host, 'admin/settings/language', $admin, [], ['enabled' => ['bn'], 'default' => 'en'])->assertStatus(422)->assertJsonValidationErrors('default');
        $this->req('PUT', $host, 'admin/settings/language', $admin, [], ['enabled' => ['bn'], 'default' => 'bn', 'sms_locale' => 'en'])->assertStatus(422)->assertJsonValidationErrors('sms_locale');
        $this->req('PUT', $host, 'admin/settings/language', $admin, [], ['enabled' => ['bn', 'ar'], 'default' => 'bn'])->assertStatus(422);   // ar is not in R1
    }

    public function test_a_saved_choice_reaches_bootstrap_and_the_api_language(): void
    {
        $i = $this->makeInstitution('langset');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);

        $this->req('PUT', $host, 'admin/settings/language', $admin, [], ['enabled' => ['bn', 'en'], 'default' => 'en', 'sms_locale' => 'bn'])
            ->assertOk()->assertJsonPath('data.default', 'en')->assertJsonPath('data.sms_locale', 'bn');
        $this->req('GET', $host, 'bootstrap')->assertJsonPath('data.locales.default', 'en')
            ->assertJsonPath('data.locales.enabled', ['bn', 'en'])->assertJsonPath('data.locales.dir', ['bn' => 'ltr', 'en' => 'ltr'])
            ->assertHeader('Content-Language', 'en');

        $this->req('PUT', $host, 'admin/settings/language', $admin, [], ['enabled' => ['bn'], 'default' => 'bn'])->assertOk();
        $this->req('GET', $host, 'bootstrap', null, ['Accept-Language' => 'en'])->assertJsonPath('data.locales.enabled', ['bn'])
            ->assertHeader('Content-Language', 'bn');
    }
}
