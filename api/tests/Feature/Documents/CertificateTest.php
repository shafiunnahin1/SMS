<?php

namespace Tests\Feature\Documents;

use App\Models\{AuditLog, Certificate, MemoNumber};
use App\Services\Documents\CertificateService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D210 CERT.1 (+ docs/modules/quick-wins.md section 2): attestation / testimonial get their own memo kinds, other certificates share
// `certificate`; CERT-YYYY-NNNN; a 12-character verify code (VerifyCodeTest); the print is a PDF; cancelling keeps the certificate
// and cancels its memo number (RevokeTest); the public check shows valid / revoked / not found with a masked name and nothing else
// (VerifyPageTest), another institution's code is not found (VerifyTenancyTest), 30 a minute (VerifyThrottleTest); a TC is checked too.
class CertificateTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_issue_print_cancel_and_public_check(): void
    {
        $this->travelTo('2026-11-13 10:00:00');
        $s = $this->school('cert');
        $o = $this->school('cert2');
        foreach ([$s, $o] as $x) $x['i']->forceFill(['settings' => array_replace($x['i']->settings ?? [], ['public_site' => ['enabled' => true, 'admission_open' => true]])])->save();
        $h = $s['host'];
        $admin = $s['admin'];

        $a = $this->api('POST', $h, "students/{$s['mine']->id}/certificates", $admin, ['type' => 'attestation', 'title' => 'প্রত্যয়নপত্র', 'description' => 'এই মর্মে প্রত্যয়ন করা যাচ্ছে যে...'])->assertCreated();
        $t = $this->api('POST', $h, "students/{$s['mine']->id}/certificates", $admin, ['type' => 'testimonial', 'title' => 'প্রশংসাপত্র'])->assertCreated();
        $m = $this->api('POST', $h, "students/{$s['other']->id}/certificates", $admin, ['type' => 'merit', 'title' => 'মেধা সনদ'])->assertCreated();
        $this->api('POST', $h, "students/{$s['other']->id}/certificates", $admin, ['type' => 'fake', 'title' => 'x'])->assertStatus(422);
        $this->assertSame(['CERT-2026-0001', 'CERT-2026-0002', 'CERT-2026-0003'], [$a->json('data.certificate_no'), $t->json('data.certificate_no'), $m->json('data.certificate_no')]);
        // default subject codes: attestation 02, testimonial 03, certificate 04 - each its own file
        $this->assertSame(['00.00.0000.000.000.02.0001.26.1', '00.00.0000.000.000.03.0001.26.1', '00.00.0000.000.000.04.0001.26.1'], [$a->json('data.memo_no'), $t->json('data.memo_no'), $m->json('data.memo_no')]);
        $code = $a->json('data.verify_code');
        $this->assertMatchesRegularExpression('/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$/', $code);
        $this->assertNotSame($code, $t->json('data.verify_code'));

        $pdf = $this->api('GET', $h, 'certificates/' . $a->json('data.id') . '/pdf', $admin)->assertOk();
        $this->assertSame('application/pdf', $pdf->headers->get('Content-Type'));
        if ($out = getenv('CERT_PDF_OUT')) file_put_contents($out, $pdf->getContent());

        // the public check: valid, masked name, nothing else; lower case accepted; unknown -> not_found
        $check = function (array $x, string $c) { $this->app['auth']->forgetGuards(); return $this->getJson("http://{$x['host']}/api/v1/public/verify/{$c}"); };
        $r = $check($s, strtolower($code))->assertOk();
        $name = Tenancy::as($s['i'], fn () => $s['mine']->user->name);
        $this->assertSame(['valid', 'attestation', 'CERT-2026-0001', '2026-11-13', CertificateService::mask($name)], [$r->json('data.status'), $r->json('data.kind'), $r->json('data.number'), $r->json('data.issued_date'), $r->json('data.holder')]);
        $this->assertStringNotContainsString($name, $r->getContent());
        $this->assertSame(['status', 'revoked_on', 'kind', 'number', 'issued_date', 'holder'], array_keys($r->json('data')));
        $this->assertSame(['status' => 'not_found'], $check($s, 'ZZZZZZZZZZZZ')->json('data'));
        $this->assertSame(['status' => 'not_found'], $check($o, $code)->json('data'));   // another institution

        // cancel: kept, memo number cancelled, the check says revoked
        $this->api('POST', $h, 'certificates/' . $a->json('data.id') . '/cancel', $admin, ['reason' => 'ভুল তথ্য'])->assertOk()->assertJsonPath('data.revoked', true);
        $this->api('POST', $h, 'certificates/' . $a->json('data.id') . '/cancel', $admin, ['reason' => 'আবার'])->assertStatus(422)->assertJsonPath('error', 'certificate_revoked');
        $this->assertSame(['revoked', '2026-11-13'], [$check($s, $code)->json('data.status'), $check($s, $code)->json('data.revoked_on')]);
        Tenancy::as($s['i'], function () use ($a) {
            $this->assertSame('cancelled', MemoNumber::where('memo_no', $a->json('data.memo_no'))->value('status'));
            try { Certificate::first()->delete(); $this->fail('a certificate was deleted'); } catch (\LogicException) {}
            $this->assertSame(1, AuditLog::where('action', 'certificate.cancelled')->count());
        });

        // a TC issued now has a code and is checked too
        $tc = $this->api('POST', $h, "students/{$s['sister']->id}/tc", $admin, [])->assertCreated();
        $tcCode = Tenancy::as($s['i'], fn () => \App\Models\TcCertificate::find($tc->json('data.id'))->verify_code);
        $this->assertSame(['valid', 'tc'], [$check($s, $tcCode)->json('data.status'), $check($s, $tcCode)->json('data.kind')]);

        $this->assertCount(3, $this->api('GET', $h, 'certificates', $admin)->json('data'));
        $this->assertCount(1, $this->api('GET', $h, 'certificates?type=testimonial', $admin)->json('data'));
        $this->api('GET', $h, 'certificates', $s['karimUser'])->assertForbidden();

        for ($n = 0; $n < 30; $n++) $check($s, 'ZZZZZZZZZZZZ');
        $check($s, $code)->assertStatus(429);   // 30 a minute
    }

    public function test_mask_keeps_the_first_letter_of_each_word(): void
    {
        $this->assertSame('R*** A***', CertificateService::mask('Rafiul Alam'));
        $this->assertSame('রা*** আ***', CertificateService::mask('রাফি আলম'));
        $this->assertNull(CertificateService::mask(' '));
    }
}
