<?php

namespace Tests\Feature\Exams;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "MarksheetAccessTest" + Step 4.5 Done When: admin / teacher any student of the institution; a parent only their
// own child (another: 404) and only a published exam (unpublished: 403 - AGENT-PLAN-R1 4.5); accountant 403; the PDF is
// printed by Chromium (Bengali shaping, D50).
class MarksheetAccessTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_who_may_read_which_marksheet(): void
    {
        $s = $this->school('msa');
        $id = $this->exam($s);
        $this->api('POST', $s['host'], 'results/bulk', $s['admin'], ['exam_id' => $id, 'subject_id' => $s['bangla']->id,
            'rows' => [['student_id' => $s['mine']->id, 'marks_obtained' => 72], ['student_id' => $s['other']->id, 'is_absent' => true]]])->assertOk();
        $this->api('POST', $s['host'], 'results/bulk', $s['admin'], ['exam_id' => $id, 'subject_id' => $s['physics']->id,
            'rows' => [['student_id' => $s['mine']->id, 'components' => ['written' => 50, 'mcq' => 20]]]])->assertOk();
        $url = fn ($sid, $json = true) => "results/marksheet/{$sid}?exam_id={$id}" . ($json ? '&format=json' : '');

        $this->api('GET', $s['host'], $url($s['other']->id), $s['admin'])->assertOk()->assertJsonPath('data.subjects.0.is_absent', true)
            ->assertJsonPath('data.total.is_pass', false);
        $this->api('GET', $s['host'], $url($s['mine']->id), $s['otherUser'])->assertOk()->assertJsonPath('data.total.obtained', 142);
        $this->api('GET', $s['host'], $url($s['mine']->id), $s['parent'])->assertForbidden();               // not published
        $accountant = $this->makeUser($s['i'], 'accountant');
        $this->api('GET', $s['host'], $url($s['mine']->id), $accountant)->assertForbidden();

        $this->api('POST', $s['host'], "exams/{$id}/publish", $s['admin'])->assertOk();
        $sheet = $this->api('GET', $s['host'], $url($s['mine']->id), $s['parent'])->assertOk()->json('data');
        $this->assertSame([71, true, 4.0, 'A'], [$sheet['total']['percentage'], $sheet['total']['is_pass'], (float) $sheet['total']['gpa'], $sheet['subjects'][0]['grade']]);
        $this->assertEqualsCanonicalizing(['written' => 50, 'mcq' => 20], $sheet['subjects'][1]['component_marks']);
        $this->api('GET', $s['host'], $url($s['other']->id), $s['parent'])->assertNotFound();
        $this->api('GET', $s['host'], "results/marksheet/{$s['mine']->id}", $s['parent'])->assertStatus(422);   // exam_id required

        $pdf = $this->api('GET', $s['host'], $url($s['mine']->id, false), $s['parent'])->assertOk()->assertHeader('Content-Type', 'application/pdf')->getContent();
        $this->assertStringStartsWith('%PDF', $pdf);
        $this->assertStringContainsString('Skia/PDF', $pdf, 'Chromium (D50): Bengali conjuncts shape correctly');

        $foreign = $this->school('msa2');
        $this->api('GET', $s['host'], $url($foreign['mine']->id), $s['admin'])->assertNotFound();
    }
}
