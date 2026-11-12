<?php

namespace Tests\Feature\PublicSite;

use App\Jobs\SendSmsJob;
use App\Models\{AdmissionLead, Batch, Program};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Queue, RateLimiter};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D202 PUB.2 (docs/modules/public-website.md "Tests"): the public admission form on the institution's own host, no login.
class PublicAdmissionTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function site(array $s, array $public = []): void
    {
        $s['i']->forceFill(['settings' => array_replace($s['i']->settings ?? [], ['public_site' => $public + ['enabled' => true, 'admission_open' => true]])])->save();
    }

    private function apply(string $host, array $body, string $ip = '10.1.1.1')
    {
        $this->app['auth']->forgetGuards();
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->postJson("http://{$host}/api/v1/public/admission", $body);
    }

    public function test_the_form_makes_one_website_lead_and_tells_the_admins(): void
    {
        $this->travelTo('2030-02-01 10:00:00');
        $s = $this->school('padm');
        $o = $this->school('padm2');
        $this->site($s, ['admission_message' => 'Thanks, we will call', 'alert_sms' => true]);
        $s['i']->forceFill(['phone' => '01700000000'])->save();
        $h = $s['host'];
        $form = ['name' => '<b>Rafi</b>', 'phone' => '+8801711223344', 'guardian_name' => 'Abdul', 'consent' => true, 'message' => 'Class 6 seat?',
            'interested_program_id' => $o['p']->id, 'referred_by' => $s['admin']->id, 'status' => 'enrolled', 'source' => 'walk_in'];

        // invalid phone and missing consent are refused
        $this->apply($h, ['phone' => '12345'] + $form)->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->apply($h, array_diff_key($form, ['consent' => 1]))->assertStatus(422)->assertJsonValidationErrors('consent');

        // a valid application: 201, a `website` lead, plain text, another institution's program ignored, extra fields ignored
        $this->apply($h, $form)->assertCreated()->assertJson(['ok' => true, 'message' => 'Thanks, we will call']);
        $lead = Tenancy::as($s['i'], fn () => AdmissionLead::sole());
        $this->assertSame(['Rafi', '01711223344', 'website', 'new', null, null], [$lead->name, $lead->phone, $lead->source, $lead->status, $lead->interested_program_id, $lead->created_by]);
        $this->assertNotNull($lead->consented_at);
        $this->assertSame(1, $s['admin']->notifications()->where('data->type', 'admission_lead')->count());
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->phone === '01700000000' && $j->institutionId === $s['i']->id);

        // the raw IP is never stored anywhere in the row
        $raw = (array) DB::table('admission_leads')->where('id', $lead->id)->first();
        $this->assertStringNotContainsString('10.1.1.1', json_encode($raw));
        $this->assertSame(hash('sha256', '10.1.1.1' . config('app.key')), $raw['ip_hash']);

        // the same phone again within 24 hours: still one row, the note says it came again
        $this->apply($h, ['phone' => '01711223344', 'message' => 'Again'] + $form, '10.1.1.2')->assertOk();
        $this->assertSame(1, Tenancy::as($s['i'], fn () => AdmissionLead::count()));
        $this->assertStringContainsString('Again', Tenancy::as($s['i'], fn () => AdmissionLead::sole()->note));
        // after 24 hours a new row
        $this->travel(25)->hours();
        $this->apply($h, $form, '10.1.1.3')->assertCreated();
        $this->assertSame(2, Tenancy::as($s['i'], fn () => AdmissionLead::count()));

        // the honeypot: looks like success, nothing kept
        $this->apply($h, ['website' => 'http://spam.example', 'phone' => '01811223344'] + $form, '10.1.1.4')->assertCreated();
        $this->assertSame(0, Tenancy::as($s['i'], fn () => AdmissionLead::where('phone', '01811223344')->count()));

        // nothing reached the other institution
        $this->assertSame(0, Tenancy::as($o['i'], fn () => AdmissionLead::count()));
    }

    public function test_programs_and_batches_must_be_public_and_open(): void
    {
        $c = $this->makeInstitution('pcoach', 'coaching');
        $c->forceFill(['settings' => ['public_site' => ['enabled' => true]]])->save();
        [$pub, $hidden, $open, $done] = Tenancy::as($c, function () {
            $pub = Program::create(['name' => 'HSC Physics', 'is_public' => 1]);
            $hidden = Program::create(['name' => 'Staff course', 'is_public' => 0]);
            return [$pub, $hidden, Batch::create(['program_id' => $pub->id, 'name' => 'Morning', 'status' => 'upcoming']), Batch::create(['program_id' => $pub->id, 'name' => 'Old', 'status' => 'completed'])];
        });
        $base = ['name' => 'Mitu', 'consent' => '1'];
        $this->apply($this->hostOf($c), $base + ['phone' => '01911000001', 'interested_program_id' => $pub->id, 'interested_batch_id' => $open->id])->assertCreated();
        $this->apply($this->hostOf($c), $base + ['phone' => '01911000002', 'interested_program_id' => $pub->id, 'interested_batch_id' => $done->id])->assertCreated();
        $this->apply($this->hostOf($c), $base + ['phone' => '01911000003', 'interested_program_id' => $hidden->id])->assertCreated();
        $rows = Tenancy::as($c, fn () => AdmissionLead::orderBy('id')->get(['interested_program_id', 'interested_batch_id'])->toArray());
        $this->assertSame([[$pub->id, $open->id], [$pub->id, null], [null, null]], array_map('array_values', $rows));
    }

    public function test_throttle_closed_admission_and_the_gates(): void
    {
        config(['app.public_admission_rate' => 5]);
        $s = $this->school('pthr');
        $this->site($s);
        RateLimiter::clear($s['i']->id . '|10.9.9.9');
        for ($n = 1; $n <= 5; $n++) $this->apply($s['host'], ['name' => "A{$n}", 'phone' => '0171100000' . $n, 'consent' => true], '10.9.9.9')->assertCreated();
        $this->apply($s['host'], ['name' => 'A6', 'phone' => '01711000006', 'consent' => true], '10.9.9.9')->assertStatus(429)->assertJsonPath('error', 'too_many_requests');
        $this->apply($s['host'], ['name' => 'B', 'phone' => '01711000007', 'consent' => true], '10.9.9.8')->assertCreated();   // another IP

        $this->site($s, ['admission_open' => false]);
        $this->apply($s['host'], ['name' => 'C', 'phone' => '01711000008', 'consent' => true], '10.7.7.7')->assertNotFound();
        $this->site($s, ['enabled' => false]);
        $this->apply($s['host'], ['name' => 'C', 'phone' => '01711000008', 'consent' => true], '10.7.7.7')->assertNotFound();

        // module off -> 403 module_disabled
        $s['i']->forceFill(['enabled_modules' => ['public_site' => false]])->save();
        $this->apply($s['host'], ['name' => 'C', 'phone' => '01711000008', 'consent' => true], '10.7.7.7')->assertForbidden()->assertJsonPath('error', 'module_disabled');
    }
}
