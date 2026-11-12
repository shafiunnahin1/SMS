<?php

namespace Tests\Feature\PublicSite;

use App\Models\AuditLog;
use App\Services\ModuleGate;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D202 PUB.2 (docs/modules/public-website.md "Admin UI"): the admin edits the public site; links must be https; the hero image
// is an image up to 2 MB; the public payload follows at once; a private batch that switches its site on gets `leads`; the
// program and notice forms carry `is_public`.
class WebsiteSettingsTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_admin_edits_the_site_and_the_public_page_follows(): void
    {
        Storage::fake('public');
        $s = $this->school('wset');
        $h = $s['host'];
        $this->api('GET', $h, 'admin/settings/website', $s['karimUser'])->assertForbidden();
        $this->api('GET', $h, 'admin/settings/website', $s['admin'])->assertOk()->assertJsonPath('data.enabled', false)->assertJsonPath('data.admission_open', true);

        $this->api('PUT', $h, 'admin/settings/website', $s['admin'], ['contact' => ['map_url' => 'javascript:alert(1)']])->assertStatus(422)->assertJsonValidationErrors('contact.map_url');
        $this->api('PUT', $h, 'admin/settings/website', $s['admin'], ['hero_image_path' => 'x.png'])->assertStatus(422);
        $this->api('PUT', $h, 'admin/settings/website', $s['admin'], ['enabled' => true, 'headline' => '<script>x</script> Open', 'about' => str_repeat('a', 1501)])->assertStatus(422);
        $this->api('PUT', $h, 'admin/settings/website', $s['admin'], ['enabled' => true, 'headline' => 'Admission 2031', 'contact' => ['phone' => '01700000002', 'facebook_url' => 'https://facebook.com/x'], 'seo' => ['title' => 'Best school']])
            ->assertOk()->assertJsonPath('data.headline', 'Admission 2031')->assertJsonPath('data.contact.facebook_url', 'https://facebook.com/x')->assertJsonPath('data.seo.title', 'Best school');
        $this->api('GET', $h, 'public/site')->assertOk()->assertJsonPath('data.settings.headline', 'Admission 2031');
        $this->api('PUT', $h, 'admin/settings/website', $s['admin'], ['headline' => 'Changed'])->assertOk()->assertJsonPath('data.contact.phone', '01700000002');   // other keys stay
        $this->api('GET', $h, 'public/site')->assertJsonPath('data.settings.headline', 'Changed');                                                        // the cache was forgotten
        $this->assertTrue(Tenancy::as($s['i'], fn () => AuditLog::where('action', 'website.updated')->exists()));

        // the hero image
        $this->api('POST', $h, 'admin/settings/website/hero', $s['admin'], ['hero' => UploadedFile::fake()->create('a.pdf', 10, 'application/pdf')])->assertStatus(422);
        $this->api('POST', $h, 'admin/settings/website/hero', $s['admin'], ['hero' => UploadedFile::fake()->image('big.jpg')->size(3000)])->assertStatus(422);
        $url = $this->api('POST', $h, 'admin/settings/website/hero', $s['admin'], ['hero' => UploadedFile::fake()->image('h.jpg', 1200, 500)])->assertOk()->json('data.hero_url');
        $this->assertNotNull($url);
        $this->api('GET', $h, 'public/site')->assertJsonPath('data.settings.hero_url', $url);
        Storage::disk('public')->assertExists($s['i']->fresh()->settings['public_site']['hero_image_path']);

        // the program and notice forms carry the public switches
        $this->api('PUT', $h, "programs/{$s['p']->id}", $s['admin'], ['is_public' => false, 'public_description' => 'Ten years'])->assertOk()->assertJsonPath('data.is_public', false)->assertJsonPath('data.public_description', 'Ten years');
        $this->api('POST', $h, 'notices', $s['admin'], ['title' => 'Open day', 'content' => 'Friday', 'target' => 'all', 'is_public' => true])->assertCreated()->assertJsonPath('data.is_public', true);
        $this->assertSame(['Open day'], array_column($this->api('GET', $h, 'public/site')->json('data.notices'), 'title'));
    }

    public function test_a_private_batch_turning_its_site_on_gets_leads(): void
    {
        $pb = $this->makeInstitution('wsetpb', 'private_batch');
        $admin = $this->makeUser($pb, 'admin');
        $gate = app(ModuleGate::class);
        $this->assertFalse($gate->allows($pb, 'leads'));
        $this->api('PUT', $this->hostOf($pb), 'admin/settings/website', $admin, ['enabled' => true])->assertOk();
        $this->assertTrue($gate->allows($pb->fresh(), 'leads'));
        $this->api('PUT', $this->hostOf($pb), 'admin/settings/website', $admin, ['enabled' => false])->assertOk();
        $this->assertTrue($gate->allows($pb->fresh(), 'leads'));                 // switching off never takes the applications away
    }
}
