<?php

namespace Tests\Feature\Fees;

use App\Models\{AuditLog, Exam, ExamSubject, FeeCategory, Result, Student, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D197 AAD.1 (academics-advanced.md section 2 DueBlockTest): three threshold modes; exemptions with expiry; the admit-card bulk leaves
// held-back students out and lists them; a student's own card is 403 with the reason; the portal hides marks (staff still see);
// result SMS skip them; the reason is always returned; off by default.
class DueBlockTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function setUpSchool(): array
    {
        $s = $this->school('dueb');
        Tenancy::as($s['i'], function () use ($s) {
            FeeCategory::create(['name' => 'Tuition', 'amount' => '600.00', 'frequency' => 'monthly', 'applicable_to' => 'all']);
            $u = User::create(['institution_id' => $s['i']->id, 'name' => 'Mine', 'username' => 'DUEB-1', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
            Student::whereKey($s['mine']->id)->update(['user_id' => $u->id]);
        });
        $s['mineUser'] = User::where('username', 'DUEB-1')->first();
        $exam = $this->exam($s);
        Tenancy::as($s['i'], function () use ($s, $exam) {
            ExamSubject::where('exam_id', $exam)->update(['exam_date' => '2026-12-01']);
            foreach (['mine', 'sister', 'other'] as $k) Result::create(['exam_id' => $exam, 'student_id' => $s[$k]->id, 'subject_id' => $s['bangla']->id, 'marks_obtained' => 70]);
            Exam::whereKey($exam)->update(['status' => 'published', 'admit_card_available' => true]);
        });
        $s['exam'] = $exam;
        return $s;
    }

    private function settings(array $s, array $fees): void
    {
        $this->api('PUT', $s['host'], 'admin/settings/general', $s['admin'], ['fees' => $fees])->assertOk()->assertJsonPath('data.fees.block_admit_card', $fees['block_admit_card']);
    }

    public function test_modes_exemptions_admit_cards_results_and_sms(): void
    {
        $s = $this->setUpSchool();
        $h = $s['host'];
        // off by default: nothing is held
        $this->api('GET', $h, "students/{$s['mine']->id}/due-block", $s['admin'])->assertOk()->assertJsonPath('data.blocked.admit_card', false);

        // amount mode: 600 due < 1000 -> free; >= 500 -> held
        $this->settings($s, ['block_admit_card' => true, 'block_result' => true, 'block_threshold' => ['mode' => 'amount', 'value' => '1000'], 'block_message' => null]);
        $this->api('GET', $h, "students/{$s['mine']->id}/due-block", $s['admin'])->assertJsonPath('data.blocked.result', false);
        $this->settings($s, ['block_admit_card' => true, 'block_result' => true, 'block_threshold' => ['mode' => 'amount', 'value' => '500'], 'block_message' => null]);
        $d = $this->api('GET', $h, "students/{$s['mine']->id}/due-block", $s['admin'])->json('data');
        $this->assertSame([true, true, '600.00'], [$d['blocked']['admit_card'], $d['blocked']['result'], $d['due_amount']]);
        $this->assertStringContainsString('600', $d['reason']);
        // months mode: one month due -> 2 months needed: free; any: held
        $this->settings($s, ['block_admit_card' => true, 'block_result' => false, 'block_threshold' => ['mode' => 'months', 'value' => '2'], 'block_message' => null]);
        $this->api('GET', $h, "students/{$s['mine']->id}/due-block", $s['admin'])->assertJsonPath('data.blocked.admit_card', false);
        $this->settings($s, ['block_admit_card' => true, 'block_result' => true, 'block_threshold' => ['mode' => 'any', 'value' => null], 'block_message' => 'অফিসে যোগাযোগ করুন']);
        $this->api('GET', $h, "students/{$s['mine']->id}/due-block", $s['admin'])->assertJsonPath('data.reason', 'অফিসে যোগাযোগ করুন');

        // admit cards: everyone owes -> the bulk holds all back and says how many; the student's own card is 403 with the message
        $pdf = null;
        $this->mock(\App\Services\PdfService::class)->shouldReceive('render')->andReturnUsing(function ($v, $data) use (&$pdf) { $pdf = $data; return '%PDF'; });
        $this->api('GET', $h, "exams/{$s['exam']}/admit-cards/bulk", $s['admin'])->assertOk()->assertHeader('X-Blocked-Count', '3');
        $this->assertSame([], $pdf['cards']);
        $this->assertCount(3, $this->api('GET', $h, "exams/{$s['exam']}/admit-cards/blocked", $s['admin'])->assertOk()->json('data'));
        $this->api('GET', $h, "student/exams/{$s['exam']}/admit-card", $s['mineUser'])->assertForbidden()
            ->assertJsonPath('error', 'blocked_by_dues')->assertJsonPath('message', 'অফিসে যোগাযোগ করুন');

        // portals: marks hidden with the reason; the teacher still sees them
        $this->api('GET', $h, 'student/results', $s['mineUser'])->assertOk()->assertJsonPath('data.exams', [])->assertJsonPath('data.blocked.reason', 'অফিসে যোগাযোগ করুন');
        $this->api('GET', $h, "parent/children/{$s['mine']->id}/results", $s['parent'])->assertOk()->assertJsonPath('data.exams', []);
        $this->api('GET', $h, "results/marksheet/{$s['mine']->id}?exam_id={$s['exam']}&format=json", $s['parent'])->assertForbidden();
        $this->api('GET', $h, "results/marksheet/{$s['mine']->id}?exam_id={$s['exam']}&format=json", $s['karimUser'])->assertOk();
        $this->assertNull($this->api('GET', $h, 'student/dashboard', $s['mineUser'])->json('data.latest_result'));

        // exemption (accountant may grant; audited): through for admit cards only, until tomorrow
        $acct = $this->makeUser($s['i'], 'accountant');
        $this->api('POST', $h, "students/{$s['mine']->id}/due-block-exemptions", $acct, ['scope' => 'admit_card', 'reason' => 'Poor fund', 'expires_at' => now()->addDay()->toDateString()])
            ->assertCreated()->assertJsonPath('data.blocked.admit_card', false)->assertJsonPath('data.blocked.result', true);
        $this->assertSame(1, Tenancy::as($s['i'], fn () => AuditLog::where('action', 'fees.due_block_exempted')->count()));
        $this->api('GET', $h, "student/exams/{$s['exam']}/admit-card", $s['mineUser'])->assertOk();
        $this->travel(3)->days();
        $this->api('GET', $h, "students/{$s['mine']->id}/due-block", $s['admin'])->assertJsonPath('data.blocked.admit_card', true);   // expired
        $this->api('POST', $h, "students/{$s['mine']->id}/due-block-exemptions", $s['admin'], ['scope' => 'all', 'reason' => 'Waived'])->assertCreated();
        $this->api('GET', $h, "students/{$s['mine']->id}/due-block", $s['admin'])->assertJsonPath('data.blocked.result', false);
        $this->api('DELETE', $h, "students/{$s['mine']->id}/due-block-exemptions", $s['admin'])->assertOk()->assertJsonPath('data.blocked.result', true);
        $this->api('POST', $h, "students/{$s['mine']->id}/due-block-exemptions", $s['karimUser'], ['scope' => 'all', 'reason' => 'x'])->assertForbidden();

        // result SMS: held-back students get none and are listed
        $this->mock(\App\Services\SmsService::class)->shouldIgnoreMissing();
        $run = $this->api('POST', $h, "exams/{$s['exam']}/result-sms", $s['admin'])->assertOk()->json('data');
        $this->assertCount(3, $run['held_by_dues']);
    }
}
