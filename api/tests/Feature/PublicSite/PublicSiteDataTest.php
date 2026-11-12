<?php

namespace Tests\Feature\PublicSite;

use App\Models\{Batch, Notice, Program};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D202 PUB.2 (docs/modules/public-website.md "Tests"): GET /public/site and /public/notices show only what the institution
// published - public+active programs, public notices already out - never students, fees, phones (except the institution's
// contact) or another tenant's rows; module off -> 403, site off -> 404; the cache follows every change.
class PublicSiteDataTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_only_published_things_and_nothing_private(): void
    {
        $this->travelTo('2030-03-01 10:00:00');
        $s = $this->school('psd');
        $o = $this->school('psd2');
        $s['i']->forceFill(['settings' => ['public_site' => ['enabled' => true, 'headline' => 'Admission open', 'contact' => ['phone' => '01700000001']]]])->save();
        $o['i']->forceFill(['settings' => ['public_site' => ['enabled' => true]]])->save();
        Tenancy::as($s['i'], function () use ($s) {
            Program::whereKey($s['p']->id)->update(['public_description' => 'Ten years of schooling']);
            Program::create(['name' => 'Hidden prog', 'is_public' => 0]);
            Program::create(['name' => 'Inactive prog', 'is_public' => 1, 'is_active' => 0]);
            Notice::create(['title' => 'Public one', 'content' => 'Open day on Friday', 'target' => 'all', 'is_public' => 1, 'published_at' => now()->subDay()]);
            Notice::create(['title' => 'Staff only', 'content' => 'x', 'target' => 'all', 'is_public' => 0, 'published_at' => now()->subDay()]);
            Notice::create(['title' => 'Tomorrow', 'content' => 'x', 'target' => 'all', 'is_public' => 1, 'published_at' => now()->addDay()]);
        });
        Tenancy::as($o['i'], fn () => Notice::create(['title' => 'Other school notice', 'content' => 'x', 'target' => 'all', 'is_public' => 1, 'published_at' => now()->subDay()]));

        $res = $this->api('GET', $s['host'], 'public/site')->assertOk()
            ->assertJsonPath('data.name', 'Psd')->assertJsonPath('data.settings.headline', 'Admission open')->assertJsonPath('data.settings.contact.phone', '01700000001');
        $names = array_column($res->json('data.programs'), 'name');
        $this->assertContains($s['p']->name, $names);
        $this->assertNotContains('Hidden prog', $names);
        $this->assertNotContains('Inactive prog', $names);
        $this->assertArrayNotHasKey('batches', $res->json('data.programs.0'));             // a school shows no batches
        $this->assertSame(['Public one'], array_column($res->json('data.notices'), 'title'));
        $body = $res->getContent();
        foreach (['Karim', 'student', 'guardian', 'fee_', 'institution_id', 'Other school', $s['admin']->email] as $leak) $this->assertStringNotContainsStringIgnoringCase($leak, $body, $leak);

        $this->api('GET', $s['host'], 'public/notices')->assertOk()->assertJsonPath('meta.total', 1)->assertJsonPath('data.0.content', 'Open day on Friday');

        // the cache follows a change to a program and a notice
        Tenancy::as($s['i'], fn () => Program::find($s['p']->id)->update(['is_public' => 0]));
        $this->assertNotContains($s['p']->name, array_column($this->api('GET', $s['host'], 'public/site')->json('data.programs'), 'name'));

        // site off -> 404; module off -> 403
        $s['i']->forceFill(['settings' => ['public_site' => ['enabled' => false]]])->save();
        $this->api('GET', $s['host'], 'public/site')->assertNotFound();
        $this->api('GET', $s['host'], 'public/notices')->assertNotFound();
        $s['i']->forceFill(['enabled_modules' => ['public_site' => false]])->save();
        $this->api('GET', $s['host'], 'public/site')->assertForbidden()->assertJsonPath('error', 'module_disabled');
    }

    public function test_a_coaching_site_lists_open_batch_names_and_times_only(): void
    {
        $c = $this->makeInstitution('psdc', 'coaching');
        $c->forceFill(['settings' => ['public_site' => ['enabled' => true]]])->save();
        Tenancy::as($c, function () {
            $p = Program::create(['name' => 'SSC Math', 'is_public' => 1, 'duration_months' => 6, 'course_fee' => '3000.00']);
            Batch::create(['program_id' => $p->id, 'name' => 'Evening', 'status' => 'running', 'monthly_fee' => '1500.00', 'max_capacity' => 30, 'schedule' => [['day' => 'sat', 'start' => '16:00', 'end' => '17:30']]]);
            Batch::create(['program_id' => $p->id, 'name' => 'Finished', 'status' => 'completed']);
        });
        $p = $this->api('GET', $this->hostOf($c), 'public/site')->assertOk()->json('data.programs.0');
        $this->assertSame([6, 'Evening', '16:00'], [$p['duration_months'], $p['batches'][0]['name'], $p['batches'][0]['schedule'][0]['start']]);
        $this->assertCount(1, $p['batches']);
        $this->assertSame(['id', 'name', 'schedule', 'status'], array_keys($p['batches'][0]));     // never the fee or the seats
    }
}
