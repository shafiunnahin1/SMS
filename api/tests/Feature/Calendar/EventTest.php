<?php

namespace Tests\Feature\Calendar;

use App\Models\{AuditLog, EventRegistration, Exam, Holiday, InstitutionEvent, Program};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D213 CAL.2: the admin manages events (audience, programs, registration with deadline and limit); a student registers and cancels
// until the deadline, never twice or beyond the limit, never for an event not meant for them or of another institution; the month
// calendar shows each role its holidays, exams and events; the public calendar shows only public events for everyone, no login.
class EventTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_events_registration_calendars(): void
    {
        $this->travelTo('2026-11-13 10:00:00');
        $s = $this->school('evt');   // Class 10 (p): Mine in A, Sister in B, Other in A; the parent of Mine and Sister
        $h = $s['host'];
        $admin = $s['admin'];
        $mine = Tenancy::as($s['i'], fn () => $s['mine']->user);
        $mine->forceFill(['must_change_password' => false])->save();
        $other = Tenancy::as($s['i'], fn () => $s['other']->user);
        $other->forceFill(['must_change_password' => false])->save();
        $class9 = Tenancy::as($s['i'], fn () => Program::create(['name' => 'Class 9']));

        $sports = ['title' => 'বার্ষিক ক্রীড়া', 'type' => 'sports', 'event_date' => '2026-12-10', 'start_time' => '09:00', 'end_time' => '13:00', 'venue' => 'মাঠ',
            'target_audience' => 'students', 'program_ids' => [$s['p']->id], 'registration_required' => true, 'registration_deadline' => '2026-12-01', 'max_participants' => 1];
        $this->api('POST', $h, 'events', $admin, ['target_audience' => 'teachers'] + $sports)->assertStatus(422)->assertJsonPath('error', 'event_registration_students');
        $this->api('POST', $h, 'events', $admin, ['registration_deadline' => '2026-12-11'] + $sports)->assertStatus(422);
        $this->api('POST', $h, 'events', $s['karimUser'], $sports)->assertForbidden();
        $sp = $this->api('POST', $h, 'events', $admin, $sports)->assertCreated()->json('data.id');
        $meeting = $this->api('POST', $h, 'events', $admin, ['title' => 'শিক্ষক সভা', 'type' => 'academic', 'event_date' => '2026-11-20', 'target_audience' => 'teachers'])->assertCreated()->json('data.id');
        $fair = $this->api('POST', $h, 'events', $admin, ['title' => 'বিজ্ঞান মেলা', 'type' => 'academic', 'event_date' => '2026-11-25', 'target_audience' => 'all', 'is_public' => true])->assertCreated()->json('data.id');
        $nine = $this->api('POST', $h, 'events', $admin, ['title' => 'নবম শ্রেণির সভা', 'type' => 'other', 'event_date' => '2026-11-26', 'target_audience' => 'all', 'program_ids' => [$class9->id]])->assertCreated()->json('data.id');

        // who sees what
        $this->assertEqualsCanonicalizing([$fair, $sp], array_column($this->api('GET', $h, 'events/upcoming', $mine)->assertOk()->json('data'), 'id'));
        $this->assertEqualsCanonicalizing([$meeting, $fair, $nine], array_column($this->api('GET', $h, 'events/upcoming', $s['karimUser'])->json('data'), 'id'));
        $this->assertEqualsCanonicalizing([$fair], array_column($this->api('GET', $h, 'events/upcoming', $s['parent'])->json('data'), 'id'));

        // registration: once, up to the limit, until the deadline; not for an event that needs none or is not meant for them
        $this->api('POST', $h, "events/{$fair}/register", $mine)->assertStatus(422)->assertJsonPath('error', 'event_no_registration');
        $this->api('POST', $h, "events/{$nine}/register", $mine)->assertNotFound();
        $this->api('POST', $h, "events/{$sp}/register", $mine)->assertCreated();
        $this->api('POST', $h, "events/{$sp}/register", $mine)->assertStatus(422)->assertJsonPath('error', 'event_already_registered');
        $this->api('POST', $h, "events/{$sp}/register", $other)->assertStatus(422)->assertJsonPath('error', 'event_full');
        $this->assertTrue(collect($this->api('GET', $h, 'events/upcoming', $mine)->json('data'))->firstWhere('id', $sp)['registered']);
        $this->assertSame([$sp], array_column($this->api('GET', $h, 'student/events', $mine)->assertOk()->json('data'), 'id'));
        $regs = $this->api('GET', $h, "events/{$sp}/registrations", $admin)->assertOk()->json('data');
        $this->assertSame([$s['mine']->id], array_column(array_column($regs, 'student'), 'id'));

        // the admin cannot drop registration or the limit below the registered count
        $this->api('PUT', $h, "events/{$sp}", $admin, ['registration_required' => false] + $sports)->assertStatus(422)->assertJsonPath('error', 'event_has_registrations');
        $this->api('PUT', $h, "events/{$sp}", $admin, ['max_participants' => 2] + $sports)->assertOk()->assertJsonPath('data.registrations_count', 1);
        $this->api('POST', $h, "events/{$sp}/register", $other)->assertCreated();
        $this->api('DELETE', $h, "events/{$sp}/register", $other)->assertOk();

        // after the deadline: no registering, no cancelling
        $this->travelTo('2026-12-02 10:00:00');
        $this->api('POST', $h, "events/{$sp}/register", $other)->assertStatus(422)->assertJsonPath('error', 'event_registration_closed');
        $this->api('DELETE', $h, "events/{$sp}/register", $mine)->assertStatus(422)->assertJsonPath('error', 'event_registration_closed');
        $this->travelTo('2026-11-13 10:00:00');

        // another institution's event is not found for this student
        $t = $this->school('evt2');
        $foreign = Tenancy::as($t['i'], fn () => InstitutionEvent::create(['title' => 'F', 'type' => 'other', 'event_date' => '2026-12-20', 'registration_required' => true])->id);
        $this->api('POST', $h, "events/{$foreign}/register", $mine)->assertNotFound();

        // the month calendar: holidays, exams of the caller's programs, events meant for them, the weekly holiday
        Tenancy::as($s['i'], fn () => Holiday::create(['title' => 'শহীদ দিবস', 'date' => '2026-11-21']));
        $exam = $this->exam($s);
        Tenancy::as($s['i'], fn () => Exam::whereKey($exam)->update(['start_date' => '2026-11-28', 'end_date' => '2026-12-05']));
        Tenancy::as($s['i'], fn () => Exam::create(['name' => 'Class 9 test', 'program_id' => $class9->id, 'exam_type' => 'term', 'academic_year' => 2026, 'start_date' => '2026-11-16']));
        $c = $this->api('GET', $h, 'calendar?month=2026-11', $mine)->assertOk()->json('data');
        $this->assertSame(['2026-11-21'], array_column($c['holidays'], 'date'));
        $this->assertSame([$exam], array_column($c['exams'], 'id'));
        $this->assertSame([$fair], array_column($c['events'], 'id'));
        $this->assertSame([5], $c['weekly_holidays']);
        $this->assertCount(2, $this->api('GET', $h, 'calendar?month=2026-11', $s['karimUser'])->json('data.exams'));
        $this->assertEqualsCanonicalizing([$meeting, $fair, $nine], array_column($this->api('GET', $h, 'calendar?month=2026-11', $s['karimUser'])->json('data.events'), 'id'));
        $this->assertSame([$exam], array_column($this->api('GET', $h, 'calendar?month=2026-12', $s['parent'])->json('data.exams'), 'id'));

        // the public calendar: no login, only events marked public for everyone, no names of people
        $p = $this->getJson("http://{$h}/api/v1/public/calendar?month=2026-11")->assertOk()->json('data');
        $this->assertSame([$fair], array_column($p['events'], 'id'));
        $this->assertSame(['2026-11-21'], array_column($p['holidays'], 'date'));
        $this->assertStringNotContainsString('Karim', json_encode($p, JSON_UNESCAPED_UNICODE));

        // delete takes the registrations along
        $this->api('DELETE', $h, "events/{$sp}", $admin)->assertOk();
        Tenancy::as($s['i'], function () use ($sp) {
            $this->assertSame(0, EventRegistration::where('event_id', $sp)->count());
            $this->assertSame(['event.created', 'event.created', 'event.created', 'event.created', 'event.updated', 'event.deleted'], AuditLog::where('action', 'like', 'event.%')->orderBy('id')->pluck('action')->all());
        });
    }
}
