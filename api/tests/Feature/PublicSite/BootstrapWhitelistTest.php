<?php

namespace Tests\Feature\PublicSite;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D202 PUB.2 (docs/modules/public-website.md "Bootstrap Whitelist"): /bootstrap shows only the allow-listed settings and, of the
// public site, only `enabled` - never its texts, the alert switch, payment or SMS keys.
class BootstrapWhitelistTest extends TestCase
{
    use RefreshDatabase;

    public function test_bootstrap_shows_only_the_allow_list(): void
    {
        $i = $this->makeInstitution('bwl');
        $i->forceFill(['settings' => ['public_site' => ['enabled' => true, 'headline' => 'HEADLINE-X', 'alert_sms' => true, 'contact' => ['phone' => '01700000003']],
            'platform_collect' => true, 'platform_fee_percent' => 2, 'payment' => ['bkash_secret' => 'BK-SECRET'], 'sms_sender' => 'SMS-SECRET']])->save();
        $settings = $this->api('GET', $this->hostOf($i), 'bootstrap')->assertOk()->json('data.settings');
        $this->assertSame(['fee_proration', 'use_programs', 'student_portal', 'use_gpa', 'public_site'], array_keys($settings));
        $this->assertSame(['enabled' => true], $settings['public_site']);
        foreach (['HEADLINE-X', 'BK-SECRET', 'SMS-SECRET', '01700000003', 'alert_sms', 'platform'] as $leak) $this->assertStringNotContainsString($leak, json_encode($settings));
    }
}
