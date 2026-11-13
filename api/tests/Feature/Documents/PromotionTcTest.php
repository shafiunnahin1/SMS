<?php

namespace Tests\Feature\Documents;

use App\Models\{AuditLog, Batch, Enrollment, MemoNumber, Program, Student, TcCertificate};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D210 PTC.1 (docs/modules/promotion-tc.md): bulk promotion ends the old enrollment as `promoted` and starts one in the target batch
// (history kept, skipped ones reported); the TC gets TC-YYYY-NNNN and the next memo number (kind tc), ends the student's enrollments
// as transferred, prints with the memo number and dates in Bangla digits; a second TC is refused; cancelling keeps the TC and cancels
// its memo number; admin only.
class PromotionTcTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_promotion_and_tc_with_memo_number(): void
    {
        $this->travelTo('2026-11-13 10:00:00');
        $s = $this->school('ptc');
        $h = $s['host'];
        $admin = $s['admin'];
        $s['i']->forceFill(['settings' => array_replace($s['i']->settings ?? [], ['memo' => ['ministry' => '37', 'office' => '02', 'geo' => '2644', 'sub_institution' => '000', 'branch' => '001',
            'subjects' => ['tc' => '05', 'attestation' => '06', 'testimonial' => '07', 'certificate' => '08', 'letter' => '09', 'notice' => '10']]])])->save();
        $next = Tenancy::as($s['i'], fn () => Batch::create(['program_id' => Program::create(['name' => 'Class 11'])->id, 'name' => 'A']));

        // promotion: Mine and Other move from Class 10 A; Sister (B) is not chosen; an unknown id is reported
        $r = $this->api('POST', $h, 'students/promote', $admin, ['student_ids' => [$s['mine']->id, $s['other']->id, 999999], 'to_batch_id' => $next->id])->assertOk();
        $this->assertSame(2, $r->json('data.promoted'));
        $this->assertSame([['id' => 999999, 'reason' => 'not_found']], $r->json('data.skipped'));
        $this->assertSame(['already_in_target'], array_column($this->api('POST', $h, 'students/promote', $admin, ['student_ids' => [$s['mine']->id], 'to_batch_id' => $next->id])->json('data.skipped'), 'reason'));
        Tenancy::as($s['i'], function () use ($s, $next) {
            $this->assertSame(['promoted', 'active'], Enrollment::where('student_id', $s['mine']->id)->orderBy('id')->pluck('status')->all());
            $this->assertSame($next->id, Enrollment::where('student_id', $s['mine']->id)->where('status', 'active')->value('batch_id'));
        });

        // TC for Other: number, memo number, enrollments ended, student transferred
        $tc = $this->api('POST', $h, "students/{$s['other']->id}/tc", $admin, ['reason' => 'অভিভাবকের বদলি', 'last_class' => 'দশম', 'last_attendance_date' => '2026-11-10'])->assertCreated();
        $this->assertSame(['TC-2026-0001', '37.02.2644.000.001.05.0001.26.1', '৩৭.০২.২৬৪৪.০০০.০০১.০৫.০০০১.২৬.১'], [$tc->json('data.tc_number'), $tc->json('data.memo_no'), $tc->json('data.memo_no_bn')]);
        $tcId = $tc->json('data.id');
        Tenancy::as($s['i'], function () use ($s, $tcId) {
            $this->assertSame('transferred', Student::find($s['other']->id)->status);
            $this->assertSame(0, Enrollment::where('student_id', $s['other']->id)->where('status', 'active')->count());
            $this->assertSame('tc_certificate:' . $tcId, MemoNumber::where('memo_no', '37.02.2644.000.001.05.0001.26.1')->value('source_key'));
        });
        $this->api('POST', $h, "students/{$s['other']->id}/tc", $admin, [])->assertStatus(422)->assertJsonPath('error', 'student_transferred');
        $this->api('POST', $h, "students/{$s['mine']->id}/tc", $admin, ['last_attendance_date' => '2030-01-01'])->assertStatus(422);   // not in the future

        // the printed TC is a PDF
        $pdf = $this->api('GET', $h, "tc/{$tcId}/pdf", $admin)->assertOk();
        $this->assertSame('application/pdf', $pdf->headers->get('Content-Type'));
        if ($out = getenv('TC_PDF_OUT')) file_put_contents($out, $pdf->getContent());   // a person can look at it (not part of the check)

        // a second TC takes the next numbers; cancelling keeps the TC and cancels its memo number
        $tc2 = $this->api('POST', $h, "students/{$s['sister']->id}/tc", $admin, [])->assertCreated();
        $this->assertSame(['TC-2026-0002', '37.02.2644.000.001.05.0001.26.2'], [$tc2->json('data.tc_number'), $tc2->json('data.memo_no')]);
        $this->api('POST', $h, 'tc/' . $tc2->json('data.id') . '/cancel', $admin, ['reason' => 'ভুল শিক্ষার্থী'])->assertOk()->assertJsonPath('data.revoked', true);
        $this->api('POST', $h, 'tc/' . $tc2->json('data.id') . '/cancel', $admin, ['reason' => 'আবার'])->assertStatus(422)->assertJsonPath('error', 'tc_revoked');
        Tenancy::as($s['i'], function () {
            $this->assertSame('cancelled', MemoNumber::where('memo_no', '37.02.2644.000.001.05.0001.26.2')->value('status'));
            $this->assertSame(2, TcCertificate::count());
            try { TcCertificate::first()->delete(); $this->fail('a TC was deleted'); } catch (\LogicException) {}
            $this->assertSame(['tc.issued', 'tc.issued', 'tc.cancelled'], AuditLog::where('action', 'like', 'tc.%')->orderBy('id')->pluck('action')->all());
        });
        $this->assertSame(['TC-2026-0002', 'TC-2026-0001'], array_column($this->api('GET', $h, 'tc', $admin)->assertOk()->json('data'), 'tc_number'));
        $this->api('GET', $h, 'tc', $s['karimUser'])->assertForbidden();
        $this->api('POST', $h, 'students/promote', $this->makeUser($s['i'], 'accountant'), ['student_ids' => [$s['mine']->id], 'to_batch_id' => $next->id])->assertForbidden();
    }
}
