<?php

namespace Tests\Feature\Documents;

use App\Models\{MemoNumber, Notice, OfficialLetter};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D210 LTR.1: an official letter takes the next memo number of kind `letter`, prints as a PDF, cancels without deletion (memo number
// cancelled); every new notice takes a memo number of kind `notice`, shown to its readers; deleting a notice cancels its number;
// admin only.
class LetterTest extends TestCase
{
    use RefreshDatabase;

    public function test_letters_and_notice_memo_numbers(): void
    {
        $this->travelTo('2026-11-13 10:00:00');
        $i = $this->makeInstitution('ltr');
        $h = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');

        $this->api('POST', $h, 'letters', $admin, ['subject' => 'S'])->assertStatus(422);
        $l1 = $this->api('POST', $h, 'letters', $admin, ['subject' => 'বার্ষিক ক্রীড়া প্রতিযোগিতা', 'recipient' => "জেলা শিক্ষা অফিসার\nঢাকা", 'body' => 'সবিনয় নিবেদন এই যে...'])->assertCreated();
        $l2 = $this->api('POST', $h, 'letters', $admin, ['subject' => 'দ্বিতীয়', 'recipient' => 'UNO', 'body' => '...'])->assertCreated();
        $this->assertSame(['00.00.0000.000.000.05.0001.26.1', '00.00.0000.000.000.05.0001.26.2'], [$l1->json('data.memo_no'), $l2->json('data.memo_no')]);
        $this->assertSame('০০.০০.০০০০.০০০.০০০.০৫.০০০১.২৬.১', $l1->json('data.memo_no_bn'));

        $pdf = $this->api('GET', $h, 'letters/' . $l1->json('data.id') . '/pdf', $admin)->assertOk();
        $this->assertSame('application/pdf', $pdf->headers->get('Content-Type'));
        if ($out = getenv('LETTER_PDF_OUT')) file_put_contents($out, $pdf->getContent());

        $this->api('POST', $h, 'letters/' . $l2->json('data.id') . '/cancel', $admin, ['reason' => 'ভুল'])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->api('POST', $h, 'letters/' . $l2->json('data.id') . '/cancel', $admin, ['reason' => 'আবার'])->assertStatus(422)->assertJsonPath('error', 'letter_cancelled');

        // notices: a memo number each (kind notice, subject 06); the reader sees it; deleting cancels it
        $n1 = $this->api('POST', $h, 'notices', $admin, ['title' => 'ছুটির নোটিশ', 'content' => 'আগামীকাল ছুটি', 'target' => 'all'])->assertCreated();
        $n2 = $this->api('POST', $h, 'notices', $admin, ['title' => 'পরীক্ষার নোটিশ', 'content' => '...', 'target' => 'all'])->assertCreated();
        $this->assertSame(['00.00.0000.000.000.06.0001.26.1', '00.00.0000.000.000.06.0001.26.2'], [$n1->json('data.memo_no'), $n2->json('data.memo_no')]);
        $teacher = $this->makeUser($i, 'teacher');
        $this->assertSame('০০.০০.০০০০.০০০.০০০.০৬.০০০১.২৬.১', $this->api('GET', $h, 'notices/' . $n1->json('data.id'), $teacher)->assertOk()->json('data.memo_no_bn'));
        $this->api('DELETE', $h, 'notices/' . $n2->json('data.id'), $admin)->assertOk();

        Tenancy::as($i, function () {
            $this->assertSame(['issued', 'cancelled', 'issued', 'cancelled'], MemoNumber::orderBy('id')->pluck('status')->all());
            $this->assertSame(OfficialLetter::orderBy('id')->pluck('id')->map(fn ($id) => 'official_letter:' . $id)->all(), MemoNumber::where('doc_kind', 'letter')->orderBy('id')->pluck('source_key')->all());
            try { OfficialLetter::first()->delete(); $this->fail('a letter was deleted'); } catch (\LogicException) {}
            $this->assertSame(2, Notice::withTrashed()->whereNotNull('memo_no')->count());
        });
        $this->assertCount(2, $this->api('GET', $h, 'letters', $admin)->json('data'));
        $this->api('GET', $h, 'letters', $teacher)->assertForbidden();
        $this->api('POST', $h, 'letters', $this->makeUser($i, 'accountant'), ['subject' => 'S', 'recipient' => 'R', 'body' => 'B'])->assertForbidden();
    }
}
