<?php

namespace Tests\Feature\Privacy;

use App\Models\{AuditLog, SmsLog};
use App\Support\Tenancy;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// Step 8.1 (docs/legal/privacy-and-consent.md section 4): sms:trim empties SMS texts after 90 days and deletes the rows after
// 180; audit:trim deletes audit rows after 2 years - in every institution (suspended ones too) and the platform's own rows.
// Newer rows and other kinds of data are untouched. Both are on the scheduler.
class RetentionPurgeTest extends TestCase
{
    use RefreshDatabase;

    private function sms($i, int $daysAgo, string $text): SmsLog
    {
        return Tenancy::as($i, fn () => tap(SmsLog::create(['to_phone' => '01711111111', 'message' => $text, 'status' => 'sent', 'sender_id' => 'X',
            'segments' => 1, 'encoding' => 'gsm', 'cost' => '0.40']), fn ($l) => $l->forceFill(['sent_at' => now()->subDays($daysAgo)])->save()));
    }

    public function test_sms_trim_empties_old_texts_and_deletes_older_rows_in_every_institution(): void
    {
        $a = $this->makeInstitution('reta');
        $b = $this->makeInstitution('retb', 'coaching', 'suspended');
        $fresh = $this->sms($a, 10, 'fresh');
        $old = $this->sms($a, 100, 'old text with a name');
        $gone = $this->sms($a, 200, 'very old');
        $suspendedOld = $this->sms($b, 200, 'very old b');

        $this->artisan('sms:trim')->assertSuccessful();

        Tenancy::as($a, function () use ($fresh, $old, $gone) {
            $this->assertSame('fresh', SmsLog::find($fresh->id)->message);
            $this->assertSame(['', 'sent', '0.40'], [SmsLog::find($old->id)->message, SmsLog::find($old->id)->status, SmsLog::find($old->id)->cost], 'the row and its cost stay; the text goes');
            $this->assertNull(SmsLog::find($gone->id));
        });
        $this->assertNull(Tenancy::as($b, fn () => SmsLog::find($suspendedOld->id)), 'a suspended institution ages out too');
    }

    public function test_audit_trim_deletes_rows_older_than_two_years_including_the_platforms(): void
    {
        $a = $this->makeInstitution('auda');
        $super = $this->makeUser(null, 'super_admin');
        $this->actingAs($super);
        [$recent, $old] = Tenancy::as($a, fn () => [AuditLog::record('x.recent', $a), tap(AuditLog::record('x.old', $a), fn ($r) => $r->forceFill(['created_at' => now()->subYears(2)->subDay()])->save())]);
        $platformOld = AuditLog::anyInstitution()->create(['institution_id' => null, 'user_id' => $super->id, 'action' => 'tenant.purged', 'model' => 'Institution', 'model_id' => 9]);
        $platformOld->forceFill(['created_at' => now()->subYears(3)])->save();
        $platformNew = AuditLog::anyInstitution()->create(['institution_id' => null, 'user_id' => $super->id, 'action' => 'tenant.purged', 'model' => 'Institution', 'model_id' => 10]);

        $this->artisan('audit:trim')->assertSuccessful();

        $left = AuditLog::anyInstitution()->pluck('id')->all();
        $this->assertContains($recent->id, $left);
        $this->assertContains($platformNew->id, $left);
        $this->assertNotContains($old->id, $left);
        $this->assertNotContains($platformOld->id, $left);
    }

    public function test_both_run_on_the_scheduler(): void
    {
        $events = collect(app(Schedule::class)->events())->map(fn ($e) => [$e->command, $e->expression]);
        $this->assertTrue($events->contains(fn ($e) => str_contains($e[0], 'sms:trim') && $e[1] === '10 2 * * *'), 'sms:trim daily');
        $this->assertTrue($events->contains(fn ($e) => str_contains($e[0], 'audit:trim') && $e[1] === '30 2 * * 0'), 'audit:trim weekly');
    }
}
