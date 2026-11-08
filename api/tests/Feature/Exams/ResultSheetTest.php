<?php

namespace Tests\Feature\Exams;

use App\Models\{AuditLog, Exam, FeeCategory, FinalResult, Result, Student, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D197 AAD.2 (academics-advanced.md section 1.4 ResultSheetTest): weighted 30/30/40; best-of; absent zero/exclude; weights != 100 -> 422;
// pass rules; positions with ties (failed students none); missing marks with policy "error" -> 422 listing them; a published sheet is
// immutable and a new version copies it; tabulation PDF; the student/parent see published sheets only, held back by dues.
class ResultSheetTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    /** @param array<string, array{0: float|null, 1: float|null}> $marks key => [bangla, physics] percentage, null = absent */
    private function marks(array $s, int $exam, array $marks): void
    {
        Tenancy::as($s['i'], function () use ($s, $exam, $marks) {
            foreach ($marks as $k => [$bn, $ph]) {
                foreach ([[$s['bangla']->id, $bn], [$s['physics']->id, $ph]] as [$subject, $p]) {
                    Result::create(['exam_id' => $exam, 'student_id' => $s[$k]->id, 'subject_id' => $subject, 'marks_obtained' => $p, 'percentage' => $p,
                        'is_absent' => $p === null, 'is_pass' => $p !== null && $p >= 33]);
                }
            }
            Exam::whereKey($exam)->update(['status' => 'published']);
        });
    }

    private function rule(array $components, array $extra = []): array
    {
        return array_replace(['components' => $components, 'absent_policy' => 'zero', 'missing_subject_policy' => 'error', 'pass_rule' => 'every_subject', 'pass_percent' => 33], $extra);
    }

    private function sheet(array $s, array $rule, string $name = 'Annual'): int
    {
        return $this->api('POST', $s['host'], 'result-sheets', $s['admin'], ['program_id' => $s['p']->id, 'name' => $name, 'rule' => $rule])->assertCreated()->json('data.id');
    }

    private function results(array $s, int $id): array
    {
        $this->api('POST', $s['host'], "result-sheets/{$id}/compute", $s['admin'])->assertOk();
        return collect($this->api('GET', $s['host'], "result-sheets/{$id}/preview", $s['admin'])->assertOk()->json('data.results'))->keyBy('student_id')->all();
    }

    public function test_weighted_best_of_absent_pass_rules_positions_and_versions(): void
    {
        $s = $this->school('rsht');
        $h = $s['host'];
        [$half, $pre, $final] = [$this->exam($s, 'Half'), $this->exam($s, 'Pre-test'), $this->exam($s, 'Final')];
        $this->marks($s, $half, ['mine' => [80, 60], 'sister' => [90, 20], 'other' => [50, 40]]);
        $this->marks($s, $pre, ['mine' => [70, 60], 'sister' => [90, 20], 'other' => [50, 40]]);
        $this->marks($s, $final, ['mine' => [90, 60], 'sister' => [90, 20], 'other' => [50, null]]);

        // weights must add up to 100; an exam only once; best_of <= of
        $this->api('POST', $h, 'result-sheets', $s['admin'], ['program_id' => $s['p']->id, 'name' => 'x', 'rule' => $this->rule([['exam_id' => $half, 'weight' => 30], ['exam_id' => $final, 'weight' => 40]])])
            ->assertStatus(422)->assertJsonValidationErrors('rule.components');
        $this->api('POST', $h, 'result-sheets', $s['admin'], ['program_id' => $s['p']->id, 'name' => 'x', 'rule' => $this->rule([['exam_id' => $half, 'weight' => 50], ['exam_id' => $half, 'weight' => 50]])])
            ->assertStatus(422);
        $this->api('POST', $h, 'result-sheets', $s['admin'], ['program_id' => $s['p']->id, 'name' => 'x', 'rule' => $this->rule([['of' => [$half, $pre], 'best_of' => 3, 'weight' => 60], ['exam_id' => $final, 'weight' => 40]])])
            ->assertStatus(422)->assertJsonValidationErrors('rule.components.0.best_of');
        $this->api('POST', $h, 'result-sheets', $s['teacher'] ?? $s['karimUser'], ['program_id' => $s['p']->id, 'name' => 'x', 'rule' => $this->rule([['exam_id' => $half, 'weight' => 100]])])->assertForbidden();

        // 30/30/40, absent = zero: mine bangla 81, physics 60 -> 70.5; other physics 0.3*40+0.3*40+0 = 24 -> fails; sister physics 20 fails
        $id = $this->sheet($s, $this->rule([['exam_id' => $half, 'weight' => 30], ['exam_id' => $pre, 'weight' => 30], ['exam_id' => $final, 'weight' => 40]]));
        $r = $this->results($s, $id);
        $mine = $r[$s['mine']->id];
        $this->assertEquals([70.5, true, 1, 1], [(float) $mine['total_percentage'], $mine['is_pass'], $mine['position_program'], $mine['position_batch']]);
        $this->assertEquals(81.0, collect($mine['details'])->firstWhere('subject_id', $s['bangla']->id)['weighted']);
        $this->assertEquals([24.0, false, null], [collect($r[$s['other']->id]['details'])->firstWhere('subject_id', $s['physics']->id)['weighted'], $r[$s['other']->id]['is_pass'], $r[$s['other']->id]['position_program']]);
        $this->assertSame([false, null, 'F'], [$r[$s['sister']->id]['is_pass'], $r[$s['sister']->id]['position_program'], $r[$s['sister']->id]['grade']]);

        // absent = exclude: other physics = (30*40 + 30*40)/60 = 40 -> passes, second; total_only: sister (90+20)/2 = 55 passes too, behind mine (70)
        $ex = $this->sheet($s, $this->rule([['exam_id' => $half, 'weight' => 30], ['exam_id' => $pre, 'weight' => 30], ['exam_id' => $final, 'weight' => 40]], ['absent_policy' => 'exclude']), 'Excl');
        $r = $this->results($s, $ex);
        $this->assertEquals([40.0, true, 2], [collect($r[$s['other']->id]['details'])->firstWhere('subject_id', $s['physics']->id)['weighted'], $r[$s['other']->id]['is_pass'], $r[$s['other']->id]['position_program']]);
        $to = $this->sheet($s, $this->rule([['exam_id' => $half, 'weight' => 100]], ['pass_rule' => 'total_only']), 'Total');
        $r = $this->results($s, $to);
        $this->assertEquals([55.0, true, 2], [(float) $r[$s['sister']->id]['total_percentage'], $r[$s['sister']->id]['is_pass'], $r[$s['sister']->id]['position_program']]);

        // best 1 of (half, pre) at 60 + final 40: mine bangla 0.6*80 + 0.4*90 = 84
        $bo = $this->sheet($s, $this->rule([['of' => [$half, $pre], 'best_of' => 1, 'weight' => 60], ['exam_id' => $final, 'weight' => 40]]), 'Best');
        $r = $this->results($s, $bo);
        $this->assertEquals(84.0, collect($r[$s['mine']->id]['details'])->firstWhere('subject_id', $s['bangla']->id)['weighted']);

        // a tie shares the rank: two students with the same marks are both first
        $tie = $this->exam($s, 'Tie');
        $this->marks($s, $tie, ['mine' => [60, 60], 'sister' => [50, 50], 'other' => [60, 60]]);
        $r = $this->results($s, $this->sheet($s, $this->rule([['exam_id' => $tie, 'weight' => 100]]), 'Tie'));
        $this->assertSame([1, 1, 3], [$r[$s['mine']->id]['position_program'], $r[$s['other']->id]['position_program'], $r[$s['sister']->id]['position_program']]);

        // missing marks with "error": 422 and the list; nothing computed
        $gap = $this->exam($s, 'Gap');
        $this->marks($s, $gap, ['mine' => [60, 60]]);
        $miss = $this->sheet($s, $this->rule([['exam_id' => $gap, 'weight' => 100]]), 'Gap');
        $out = $this->api('POST', $h, "result-sheets/{$miss}/compute", $s['admin'])->assertStatus(422)->json('data');
        $this->assertCount(4, $out['missing']);
        $this->assertSame(0, Tenancy::as($s['i'], fn () => FinalResult::where('result_sheet_id', $miss)->count()));

        // publish (audited) -> immutable; a new version is a draft copy
        $this->api('POST', $h, "result-sheets/{$miss}/publish", $s['admin'])->assertStatus(422);
        $this->api('POST', $h, "result-sheets/{$id}/publish", $s['admin'])->assertOk()->assertJsonPath('data.status', 'published');
        $this->assertTrue(Tenancy::as($s['i'], fn () => AuditLog::where('action', 'like', '%result_sheet%')->exists()));
        $this->api('PUT', $h, "result-sheets/{$id}", $s['admin'], ['program_id' => $s['p']->id, 'name' => 'Edit', 'rule' => $this->rule([['exam_id' => $half, 'weight' => 100]])])->assertStatus(422);
        $this->api('POST', $h, "result-sheets/{$id}/compute", $s['admin'])->assertStatus(422);
        $this->api('DELETE', $h, "result-sheets/{$id}", $s['admin'])->assertStatus(422);
        $this->api('POST', $h, "result-sheets/{$id}/new-version", $s['admin'])->assertCreated()->assertJsonPath('data.version', 2)->assertJsonPath('data.status', 'draft');

        // tabulation PDF: a landscape sheet with every student
        $seen = null;
        $this->mock(\App\Services\PdfService::class)->shouldReceive('render')->andReturnUsing(function ($v, $data, $paper, $o) use (&$seen) { $seen = [$v, count($data['rows']), $o]; return '%PDF'; });
        $this->api('GET', $h, "result-sheets/{$id}/tabulation.pdf", $s['admin'])->assertOk();
        $this->assertSame(['pdf.tabulation', 3, 'landscape'], $seen);
        $this->api('GET', $h, "result-sheets/{$id}/export.xlsx", $s['admin'])->assertOk();

        // student and parent: the published sheet only (the drafts never show)
        $u = Tenancy::as($s['i'], function () use ($s) {
            $u = User::create(['institution_id' => $s['i']->id, 'name' => 'Mine', 'username' => 'RSHT-1', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
            Student::whereKey($s['mine']->id)->update(['user_id' => $u->id]);
            return $u;
        });
        $mineSheets = $this->api('GET', $h, 'student/final-results', $u)->assertOk()->json('data.results');
        $this->assertSame([$id], array_column(array_column($mineSheets, 'sheet'), 'id'));
        $this->assertCount(1, $this->api('GET', $h, "parent/children/{$s['mine']->id}/final-results", $s['parent'])->assertOk()->json('data.results'));
        $this->api('GET', $h, "parent/children/{$s['other']->id}/final-results", $s['parent'])->assertNotFound();

        // dues hold it back (AAD.1)
        Tenancy::as($s['i'], fn () => FeeCategory::create(['name' => 'Tuition', 'amount' => '600.00', 'frequency' => 'monthly', 'applicable_to' => 'all']));
        $this->api('PUT', $h, 'admin/settings/general', $s['admin'], ['fees' => ['block_admit_card' => false, 'block_result' => true, 'block_threshold' => ['mode' => 'any', 'value' => null], 'block_message' => null]])->assertOk();
        $this->api('GET', $h, 'student/final-results', $u)->assertOk()->assertJsonPath('data.results', [])->assertJsonStructure(['data' => ['blocked' => ['reason']]]);
    }
}
