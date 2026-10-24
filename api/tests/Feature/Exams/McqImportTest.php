<?php

namespace Tests\Feature\Exams;

use App\Models\{QbOmrForm, QbOmrScan, Result};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D158 (5)(6): the MCQ part comes from pasted JSON or from the linked paper's graded OMR sheets - checked rows first (unknown,
// ambiguous or duplicate roll, out of range), only valid rows saved, only the MCQ part changed, a re-import never doubles.
class McqImportTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function linked(array $s): array
    {
        $paper = $this->paper($s);
        $exam = $this->exam($s);
        $this->api('PUT', $s['host'], "exams/{$exam}/subjects/{$s['physics']->id}/paper", $s['admin'], ['qb_paper_id' => $paper])->assertOk();
        return [$exam, $paper, "exams/{$exam}/subjects/{$s['physics']->id}/mcq-import"];
    }

    public function test_json_rows_are_checked_then_only_valid_rows_fill_the_mcq_part(): void
    {
        $s = $this->school('mcqjson');
        [$exam, , $url] = $this->linked($s);
        $rows = [['roll' => '2', 'mcq' => 21], ['roll' => '1', 'mcq' => 10], ['roll' => '1', 'batch' => 'A', 'mcq' => 25], ['roll' => '99', 'mcq' => 5],
            ['roll' => '2', 'mcq' => 3], ['roll' => '2', 'batch' => 'A', 'mcq' => 31]];
        $preview = $this->api('POST', $s['host'], $url, $s['admin'], ['source' => 'json', 'rows' => $rows])->assertOk()->json('data');
        $this->assertSame(['ok', 'ambiguous_roll', 'ok', 'unknown_roll', 'duplicate', 'out_of_range'], array_column($preview['rows'], 'status'));
        $this->assertEquals(30, $preview['mcq_full']);
        $this->assertSame(0, $preview['saved']);
        $this->assertSame(0, Tenancy::as($s['i'], fn () => Result::count()), 'a preview saves nothing');

        Tenancy::as($s['i'], fn () => Result::create(['exam_id' => $exam, 'student_id' => $s['other']->id, 'subject_id' => $s['physics']->id, 'component_marks' => ['mcq' => 1, 'cq' => 40, 'short' => 15], 'marks_obtained' => 56]));
        $this->assertSame(2, $this->api('POST', $s['host'], $url, $s['admin'], ['source' => 'json', 'rows' => $rows, 'save' => true])->json('data.saved'));
        $this->api('POST', $s['host'], $url, $s['admin'], ['source' => 'json', 'rows' => $rows, 'save' => true])->assertOk();   // again: updates, never doubles
        $other = Tenancy::as($s['i'], fn () => Result::where('student_id', $s['other']->id)->sole());
        $this->assertEquals(['mcq' => 21, 'cq' => 40, 'short' => 15], $other->component_marks, 'only the MCQ part changes');
        $this->assertEquals(76, (float) $other->marks_obtained);
        $this->assertSame(2, Tenancy::as($s['i'], fn () => Result::count()));
    }

    public function test_graded_omr_sheets_of_the_linked_paper_fill_the_mcq_part(): void
    {
        $s = $this->school('mcqomr');
        [, $paper, $url] = $this->linked($s);
        Tenancy::as($s['i'], function () use ($s, $paper) {
            $form = QbOmrForm::create(['qb_paper_id' => $paper, 'code' => 'F1', 'settings_json' => [], 'layout_version' => 1, 'locked_at' => now()]);
            $scan = fn ($student, $status, $marks) => QbOmrScan::create(['qb_omr_form_id' => $form->id, 'layout_version' => 1, 'set_code' => 'A', 'roll' => '2', 'matched_student_id' => $student,
                'answers_json' => [], 'answered_count' => 1, 'correct_count' => 1, 'obtained_marks' => $marks, 'status' => $status, 'source' => 'upload']);
            $scan($s['other']->id, 'graded', '24.00');
            $scan($s['mine']->id, 'needs_review', '30.00');      // not reviewed yet - never counted
        });
        $out = $this->api('POST', $s['host'], $url, $s['admin'], ['source' => 'omr', 'save' => true])->assertOk()->json('data');
        $this->assertSame([1, 1], [$out['sheets'], $out['saved']]);
        $this->assertEquals(['mcq' => 24], Tenancy::as($s['i'], fn () => Result::sole()->component_marks));
    }

    public function test_no_mcq_part_published_exams_and_other_teachers_are_refused(): void
    {
        $s = $this->school('mcqrefuse');
        $exam = $this->exam($s);
        $this->api('POST', $s['host'], "exams/{$exam}/subjects/{$s['bangla']->id}/mcq-import", $s['admin'], ['source' => 'json', 'rows' => [['roll' => '1', 'mcq' => 1]]])->assertStatus(422)->assertJsonPath('error', 'exam_no_mcq_part');
        $this->api('POST', $s['host'], "exams/{$exam}/subjects/{$s['physics']->id}/mcq-import", $s['admin'], ['source' => 'omr'])->assertStatus(422)->assertJsonPath('error', 'exam_no_paper');
        $this->api('POST', $s['host'], "exams/{$exam}/subjects/{$s['physics']->id}/mcq-import", $s['otherUser'], ['source' => 'json', 'rows' => [['roll' => '1', 'mcq' => 1]]])->assertStatus(403);
    }
}
