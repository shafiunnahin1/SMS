<?php

namespace Tests\Feature\Cards;

use App\Models\{ExamSubject, Student, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D193 ADM.1 (advanced-features.md section 7 Revision 6.3; pdf-reports.md ID Card; extended-features.md section 13): admit cards need
// the full exam schedule (422 exam_schedule_incomplete), list each enrolled student with the subject dates; a student gets only
// their own card and only once the admin made the cards available; ID cards print one student or a whole class / batch.
class AdmitCardTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function capture(?string &$html, int $times = 1): void
    {
        $this->mock(\App\Services\PdfService::class)->shouldReceive('render')->times($times)->andReturnUsing(function ($view, $data) use (&$html) {
            $html = view($view, $data + ['institution' => Tenancy::current(), 'theme' => ['primary_color' => '#000000'], 'locale' => 'en', 'dir' => 'ltr', 'logo' => null])->render();
            return '%PDF-test';
        });
    }

    public function test_admit_cards_need_the_schedule_and_open_to_the_student_when_available(): void
    {
        $s = $this->school('admit');
        $exam = $this->exam($s);
        $this->api('GET', $s['host'], "exams/{$exam}/admit-cards/bulk", $s['admin'])->assertStatus(422)->assertJsonPath('error', 'exam_schedule_incomplete');

        Tenancy::as($s['i'], fn () => ExamSubject::where('exam_id', $exam)->update(['exam_date' => '2026-12-01', 'start_time' => '09:00:00', 'room' => 'R5']));
        $this->api('PUT', $s['host'], "exams/{$exam}", $s['admin'], ['name' => 'Half yearly', 'exam_type' => 'term', 'academic_year' => 2026,
            'exam_center' => 'Main building', 'admit_card_instructions' => 'Bring a pen'])->assertOk();

        $html = null;
        $this->capture($html, 2);
        $this->api('GET', $s['host'], "exams/{$exam}/admit-cards/bulk", $s['admin'])->assertOk()->assertHeader('Content-Type', 'application/pdf');
        foreach (['প্রবেশপত্র', 'Half yearly', 'Mine', 'Sister', 'Other', '01/12/2026', '09:00', 'R5', 'Main building', 'Bring a pen'] as $t) $this->assertStringContainsString($t, $html);
        $this->api('GET', $s['host'], "exams/{$exam}/admit-cards/bulk?batch_id={$s['b']->id}", $s['admin'])->assertOk();
        $this->assertStringContainsString('Sister', $html);
        $this->assertStringNotContainsString('Mine', $html, 'batch B only');

        // the student: their own card only after the admin made it available
        $su = Tenancy::as($s['i'], function () use ($s) {
            $u = User::create(['institution_id' => $s['i']->id, 'name' => 'Mine', 'username' => 'ADM-S1', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
            Student::whereKey($s['mine']->id)->update(['user_id' => $u->id]);
            return $u;
        });
        $this->api('GET', $s['host'], "student/exams/{$exam}/admit-card", $su)->assertNotFound();
        $this->api('PUT', $s['host'], "exams/{$exam}", $s['admin'], ['name' => 'Half yearly', 'exam_type' => 'term', 'academic_year' => 2026,
            'admit_card_available' => true, 'admit_card_from' => now()->addDay()->toDateString()])->assertOk();
        $this->api('GET', $s['host'], "student/exams/{$exam}/admit-card", $su)->assertNotFound();   // not yet
        $this->travel(2)->days();
        $this->capture($html);
        $this->api('GET', $s['host'], "student/exams/{$exam}/admit-card", $su)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringContainsString('Mine', $html);
        $this->assertStringNotContainsString('Sister', $html);

        // another institution's exam is a 404; teachers may not print
        $o = $this->school('admit-other');
        $theirs = $this->exam($o);
        $this->api('GET', $s['host'], "student/exams/{$theirs}/admit-card", $su)->assertNotFound();
        $this->api('GET', $s['host'], "exams/{$theirs}/admit-cards/bulk", $s['admin'])->assertNotFound();
        $this->api('GET', $s['host'], "exams/{$exam}/admit-cards/bulk", $s['karimUser'])->assertForbidden();
    }

    public function test_id_cards_for_one_student_and_a_whole_batch(): void
    {
        $s = $this->school('idcard');
        $html = null;
        $this->capture($html, 2);
        $this->api('GET', $s['host'], "students/{$s['mine']->id}/card", $s['admin'])->assertOk()->assertHeader('Content-Type', 'application/pdf');
        foreach (['শিক্ষার্থী পরিচয়পত্র', 'Mine', 'Class 10 — A', Tenancy::as($s['i'], fn () => $s['mine']->fresh()->student_id)] as $t) $this->assertStringContainsString($t, $html);
        $this->assertStringNotContainsString('01711000001', $html, 'no guardian phone on the card');

        $this->api('GET', $s['host'], "students/id-cards/bulk?program_id={$s['p']->id}&batch_id={$s['a']->id}", $s['admin'])->assertOk();
        $this->assertStringContainsString('Mine', $html);
        $this->assertStringContainsString('Other', $html);
        $this->assertStringNotContainsString('Sister', $html);

        $this->api('GET', $s['host'], 'students/id-cards/bulk', $s['admin'])->assertStatus(422);
        $o = $this->school('idcard-other');
        $this->api('GET', $s['host'], "students/id-cards/bulk?program_id={$o['p']->id}", $s['admin'])->assertNotFound();
        $this->api('GET', $s['host'], "students/{$o['mine']->id}/card", $s['admin'])->assertNotFound();
        $this->api('GET', $s['host'], "students/{$s['mine']->id}/card", $s['karimUser'])->assertForbidden();
    }
}
