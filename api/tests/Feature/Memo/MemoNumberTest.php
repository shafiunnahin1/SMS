<?php

namespace Tests\Feature\Memo;

use App\Models\{AuditLog, MemoFile, MemoNumber};
use App\Services\Memo\MemoService;
use App\Support\{BanglaFormat, Tenancy};
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D210 MEMO.1: the 22-digit, 8-part memo number MM.DD.GGGG.SSS.BBB.TT.NNNN.YY + '.' + issue number; the institution's own codes
// (exact digit counts, zeros when not set), one file per kind and year, the file serial per subject code and year from 0001, issue
// numbers never reused, cancelling keeps the number; another institution has its own numbers; the Bangla date line and digits.
class MemoNumberTest extends TestCase
{
    use RefreshDatabase;

    public function test_codes_files_issue_numbers_and_cancel(): void
    {
        $this->travelTo('2026-11-13 10:00:00');
        $i = $this->makeInstitution('memoa');
        $o = $this->makeInstitution('memob');
        $h = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');

        $r = $this->api('GET', $h, 'admin/settings/memo', $admin)->assertOk();
        $this->assertSame(['00', '00', '0000', '000', '000', '01'], [$r->json('data.ministry'), $r->json('data.office'), $r->json('data.geo'), $r->json('data.sub_institution'), $r->json('data.branch'), $r->json('data.subjects.tc')]);
        $this->assertSame('২৮ কার্তিক ১৪৩৩ বঙ্গাব্দ / ১৩ নভেম্বর ২০২৬ খ্রিস্টাব্দ', $r->json('data.date_line'));

        $codes = ['ministry' => '37', 'office' => '02', 'geo' => '2644', 'sub_institution' => '000', 'branch' => '001',
            'subjects' => ['tc' => '05', 'attestation' => '06', 'testimonial' => '07', 'certificate' => '08', 'letter' => '05', 'notice' => '09']];
        $this->api('PUT', $h, 'admin/settings/memo', $admin, ['geo' => '264'] + $codes)->assertStatus(422)->assertJsonValidationErrors('geo');      // 4 digits exactly
        $this->api('PUT', $h, 'admin/settings/memo', $admin, array_replace_recursive($codes, ['subjects' => ['tc' => '5']]))->assertStatus(422);
        $r = $this->api('PUT', $h, 'admin/settings/memo', $admin, $codes)->assertOk();
        $this->assertSame('37.02.2644.000.001.05.0001.26.1', $r->json('data.example'));
        $this->assertSame('৩৭.০২.২৬৪৪.০০০.০০১.০৫.০০০১.২৬.১', $r->json('data.example_bn'));

        $svc = app(MemoService::class);
        [$a, $b, $l1, $l2] = Tenancy::as($i, fn () => [$svc->issue('tc', 'Rafi', null, $admin->id), $svc->issue('tc', 'Mim', null, $admin->id),
            $svc->issue('letter', 'DEO', null, $admin->id), $svc->issue('letter', 'UNO', null, $admin->id)]);
        $this->assertSame('37.02.2644.000.001.05.0001.26.1', $a->memo_no);
        $this->assertSame('37.02.2644.000.001.05.0001.26.2', $b->memo_no);
        // tc and letter share subject code 05: the letter file is the second file of that subject this year
        $this->assertSame(['37.02.2644.000.001.05.0002.26.1', '37.02.2644.000.001.05.0002.26.2'], [$l1->memo_no, $l2->memo_no]);
        $this->assertSame(22, strlen(str_replace('.', '', substr($a->memo_no, 0, strrpos($a->memo_no, '.')))));   // 22 digits before the issue number

        // cancelling keeps the number; the next one is never the cancelled one
        $this->api('POST', $h, "memo-register/{$b->id}/cancel", $admin, ['reason' => 'wrong name'])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->api('POST', $h, "memo-register/{$b->id}/cancel", $admin, ['reason' => 'again'])->assertStatus(422)->assertJsonPath('error', 'memo_cancelled');
        $c = Tenancy::as($i, fn () => $svc->issue('tc', 'Tanvir', null, $admin->id));
        $this->assertSame('37.02.2644.000.001.05.0001.26.3', $c->memo_no);

        // a new year: a new file from 0001, issue numbers from 1; old files keep their numbers
        $this->travelTo('2027-01-01 09:00:00');
        $this->assertSame('37.02.2644.000.001.05.0001.27.1', Tenancy::as($i, fn () => $svc->issue('tc', 'Next year', null, $admin->id))->memo_no);
        // the other institution: its own zeros codes and its own counters
        $this->assertSame('00.00.0000.000.000.01.0001.27.1', Tenancy::as($o, fn () => $svc->issue('tc', 'Other', null, null))->memo_no);

        $reg = $this->api('GET', $h, 'memo-register?doc_kind=tc&year=2026', $admin)->assertOk();
        $this->assertSame(['37.02.2644.000.001.05.0001.26.3', '37.02.2644.000.001.05.0001.26.2', '37.02.2644.000.001.05.0001.26.1'], array_column($reg->json('data'), 'memo_no'));
        $this->assertSame(['issued', 'cancelled', 'issued'], array_column($reg->json('data'), 'status'));
        $this->assertSame('wrong name', $reg->json('data.1.cancel_reason'));
        $this->assertCount(1, $this->api('GET', $h, 'memo-register?status=cancelled', $admin)->json('data'));

        Tenancy::as($i, function () {
            $this->assertSame(6, MemoNumber::count());
            try { MemoNumber::first()->delete(); $this->fail('a memo number was deleted'); } catch (\LogicException) {}
            try { MemoFile::first()->delete(); $this->fail('a memo file was deleted'); } catch (\LogicException) {}
            $this->assertSame(1, AuditLog::where('action', 'memo.cancelled')->count());
        });
        $this->api('GET', $h, 'memo-register', $this->makeUser($i, 'accountant'))->assertForbidden();
        $this->api('PUT', $h, 'admin/settings/memo', $this->makeUser($i, 'teacher'), $codes)->assertForbidden();
    }

    public function test_bangla_date_line_matches_known_days(): void
    {
        $cases = ['2025-02-21' => '৮ ফাল্গুন ১৪৩১', '2025-12-16' => '১ পৌষ ১৪৩২', '2026-03-26' => '১২ চৈত্র ১৪৩২', '2026-04-14' => '১ বৈশাখ ১৪৩৩',
            '2026-04-13' => '৩০ চৈত্র ১৪৩২', '2024-03-14' => '৩০ ফাল্গুন ১৪৩০', '2027-03-14' => '২৯ ফাল্গুন ১৪৩৩', '2027-03-15' => '১ চৈত্র ১৪৩৩'];
        foreach ($cases as $d => $bn) $this->assertStringStartsWith($bn . ' বঙ্গাব্দ / ', BanglaFormat::dateLine(Carbon::parse($d)), $d);
        $this->assertSame('৩৭.০২.১২৫', BanglaFormat::digits('37.02.125'));
    }
}
