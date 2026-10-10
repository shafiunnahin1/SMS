<?php

namespace Tests\Feature\Academic;

use App\Jobs\SendSmsJob;
use App\Models\{AuditLog, Batch, FeeCategory, Program, SmsLog, Student};
use App\Services\{AttendanceService, FeeService, SmsService, StudentService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "ConsentTest" (R1 part; the public form is the public-website module, later): record / revoke with history in
// audit_logs; SMS switched off = no reminder/alert SMS but the payment receipt still goes; one child's opt-out silences the phone.
class ConsentTest extends TestCase
{
    use RefreshDatabase;

    public function test_paper_consent_is_recorded_and_revoked_by_the_admin_with_history(): void
    {
        $i = $this->makeInstitution('consent', 'school');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        $sid = Tenancy::as($i, fn () => app(StudentService::class)->create(['name' => 'A', 'guardian_phone' => '01711113333'])->id);

        $this->api('POST', $host, "students/{$sid}/consents", $admin, ['type' => 'photo', 'status' => 'granted', 'guardian_name' => 'Karim'])->assertOk();
        $row = collect($this->api('GET', $host, "students/{$sid}/consents", $admin)->json('data'))->firstWhere('type', 'photo');
        $this->assertSame(['granted', 'paper', 'Karim'], [$row['status'], $row['method'], $row['guardian_name']]);
        $this->api('POST', $host, "students/{$sid}/consents", $admin, ['type' => 'photo', 'status' => 'revoked'])->assertOk();
        $this->api('POST', $host, "students/{$sid}/consents", $admin, ['type' => 'marketing', 'status' => 'granted'])->assertStatus(422);
        $this->assertSame(['consent.granted', 'consent.revoked'], Tenancy::as($i, fn () => AuditLog::where('action', 'like', 'consent.%')->orderBy('id')->pluck('action')->all()));
    }

    public function test_an_sms_opt_out_stops_alerts_for_that_phone_but_not_receipts(): void
    {
        $i = $this->makeInstitution('consentsms', 'coaching');
        $i->forceFill(['sms_balance' => 100, 'sms_sender_id' => 'OWN', 'sms_sender_status' => 'approved'])->save();
        $teacher = $this->makeUser($i, 'teacher');
        $this->bindTenant($i->fresh());
        $batch = Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'B']);
        FeeCategory::create(['name' => 'Tuition', 'amount' => 500, 'frequency' => 'monthly']);
        $svc = app(StudentService::class);
        $first = $svc->create(['name' => 'One', 'guardian_phone' => '01711114444'], $batch);
        $sibling = $svc->create(['name' => 'Two', 'guardian_phone' => '+8801711114444'], $batch);     // same phone, written differently
        $this->actingAs($teacher);                                                                          // the audit row needs who did it
        app(\App\Services\ConsentService::class)->revoke($first, 'sms', 'portal');
        app(AttendanceService::class)->saveBulk(['batch_id' => $batch->id, 'date' => now()->toDateString(), 'records' => [['student_id' => $sibling->id, 'status' => 'absent']]]);
        $this->assertSame(0, SmsLog::count(), "the brother's absence alert is not sent either - the opt-out is per phone");

        $fees = app(FeeService::class);
        $fees->collect($sibling, [['key' => $fees->dueLines($sibling)->first()['key']]]);
        $this->assertSame(1, SmsLog::where('status', 'sent')->count(), 'the payment receipt still goes (transactional)');
        $this->assertFalse(app(SmsService::class)->send('01711114444', 'promo'), 'a direct non-transactional send is skipped');
    }
}
