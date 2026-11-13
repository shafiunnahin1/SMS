<?php

namespace Tests\Feature\Calendar;

use App\Jobs\SendSmsJob;
use App\Models\{AcademicYear, AuditLog, Holiday};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Cache, Queue};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D213 CAL.1: the admin creates academic years and sets exactly one current (the middleware cache is cleared); adds holidays (one
// day or a range, one row per day, no two on a day, at most 60 days), edits and deletes them; a new holiday tells students, parents
// and teachers in the app; the `holiday_new` SMS event is off by default and sends one SMS per guardian phone when switched on;
// every role of the module reads the year's holidays; the attendance sheet still shows the holiday.
class AcademicCalendarTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_academic_years(): void
    {
        $this->travelTo('2026-11-13 10:00:00');
        $s = $this->school('cal');
        $h = $s['host'];
        $admin = $s['admin'];
        $a = $this->api('POST', $h, 'academic-years', $admin, ['name' => '2026', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31'])->assertCreated()->json('data');
        $this->assertFalse($a['is_current']);
        $this->api('POST', $h, 'academic-years', $admin, ['name' => '2026', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31'])->assertStatus(422);
        $this->api('POST', $h, 'academic-years', $admin, ['name' => '2027', 'start_date' => '2027-12-31', 'end_date' => '2027-01-01'])->assertStatus(422);
        $b = $this->api('POST', $h, 'academic-years', $admin, ['name' => '2027', 'start_date' => '2027-01-01', 'end_date' => '2027-12-31'])->assertCreated()->json('data');

        $this->api('PATCH', $h, "academic-years/{$a['id']}/set-current", $admin)->assertOk()->assertJsonPath('data.is_current', true);
        Cache::put('current_year:' . $s['i']->id, 'stale', 60);
        $this->api('PATCH', $h, "academic-years/{$b['id']}/set-current", $admin)->assertOk();
        $this->assertNull(Cache::get('current_year:' . $s['i']->id), 'the middleware cache is cleared');
        $list = $this->api('GET', $h, 'academic-years', $admin)->assertOk()->json('data');
        $this->assertSame([['2027', true], ['2026', false]], array_map(fn ($y) => [$y['name'], $y['is_current']], $list));
        $this->assertSame(1, Tenancy::as($s['i'], fn () => AcademicYear::where('is_current', true)->count()));
        $this->api('GET', $h, 'academic-years', $s['karimUser'])->assertForbidden();
    }

    public function test_holidays_notice_sms_and_calendar(): void
    {
        $this->travelTo('2026-11-13 10:00:00');
        $s = $this->school('hol');   // Mine and Sister share a guardian phone, Other has its own
        Queue::fake();
        $h = $s['host'];
        $admin = $s['admin'];

        // a range: one row per day; the SMS event is off by default, the in-app notice goes to parents and teachers
        $r = $this->api('POST', $h, 'holidays', $admin, ['title' => 'শীতকালীন ছুটি', 'date' => '2026-12-24', 'end_date' => '2026-12-26', 'type' => 'institution'])->assertCreated();
        $this->assertSame(['2026-12-24', '2026-12-25', '2026-12-26'], array_column($r->json('data'), 'date'));
        Queue::assertNotPushed(SendSmsJob::class);
        $this->assertSame(1, $s['parent']->notifications()->where('data->type', 'holiday_new')->count());
        $this->assertSame(1, $s['karimUser']->notifications()->where('data->type', 'holiday_new')->count());

        $this->api('POST', $h, 'holidays', $admin, ['title' => 'X', 'date' => '2026-12-26'])->assertStatus(422)->assertJsonPath('error', 'holiday_exists');
        $this->api('POST', $h, 'holidays', $admin, ['title' => 'X', 'date' => '2027-01-01', 'end_date' => '2027-03-15'])->assertStatus(422)->assertJsonPath('error', 'holiday_range_too_long');
        $this->api('POST', $h, 'holidays', $admin, ['title' => 'X', 'date' => '2027-01-02', 'end_date' => '2027-01-01'])->assertStatus(422);

        // switched on: one SMS per guardian phone
        $s['i']->forceFill(['settings' => array_replace($s['i']->settings ?? [], ['sms_events' => ['holiday_new' => 'auto']])])->save();
        $v = $this->api('POST', $h, 'holidays', $admin, ['title' => 'বিজয় দিবস', 'date' => '2026-12-16'])->assertCreated()->json('data.0');
        $this->assertSame('public', $v['type']);
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'holiday_new' && $j->phone === '01711000001');
        Queue::assertPushed(SendSmsJob::class, fn ($j) => $j->eventKey === 'holiday_new' && $j->phone === '01711000002');
        Queue::assertPushed(SendSmsJob::class, 2);
        // a past holiday is recorded without telling anyone
        $this->api('POST', $h, 'holidays', $admin, ['title' => 'অতীত', 'date' => '2026-03-26'])->assertCreated();
        Queue::assertPushed(SendSmsJob::class, 2);
        $this->assertSame(2, $s['parent']->notifications()->where('data->type', 'holiday_new')->count());

        // edit and delete
        $this->api('PUT', $h, "holidays/{$v['id']}", $admin, ['title' => 'মহান বিজয় দিবস', 'date' => '2026-12-24'])->assertStatus(422)->assertJsonPath('error', 'holiday_exists');
        $this->api('PUT', $h, "holidays/{$v['id']}", $admin, ['title' => 'মহান বিজয় দিবস', 'date' => '2026-12-16'])->assertOk()->assertJsonPath('data.title', 'মহান বিজয় দিবস');
        $past = Tenancy::as($s['i'], fn () => Holiday::where('date', '2026-03-26')->value('id'));
        $this->api('DELETE', $h, "holidays/{$past}", $admin)->assertOk();
        $this->assertSame(['2026-12-16', '2026-12-24', '2026-12-25', '2026-12-26'], array_column($this->api('GET', $h, 'holidays?month=2026-12', $admin)->json('data'), 'date'));

        // every role of the module reads the year; only the admin manages
        $this->api('GET', $h, 'holidays/calendar?year=2026', $s['karimUser'])->assertOk()->assertJsonCount(4, 'data');
        $this->api('GET', $h, 'holidays/calendar?year=2026', $s['parent'])->assertOk()->assertJsonCount(4, 'data');
        $this->api('POST', $h, 'holidays', $s['karimUser'], ['title' => 'X', 'date' => '2027-02-01'])->assertForbidden();
        $this->api('GET', $h, 'holidays', $s['karimUser'])->assertForbidden();

        // the attendance sheet still names the holiday
        $this->assertSame('মহান বিজয় দিবস', $this->api('GET', $h, "attendance?batch_id={$s['a']->id}&date=2026-12-16", $admin)->assertOk()->json('data.holiday'));
        $this->assertSame(['holiday.created', 'holiday.created', 'holiday.created', 'holiday.updated', 'holiday.deleted'],
            Tenancy::as($s['i'], fn () => AuditLog::where('action', 'like', 'holiday.%')->orderBy('id')->pluck('action')->all()));
    }
}
