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

    // D159 (3): the permanent ID resolves the same roll in two sections; an unknown ID is shown, never matched by roll
    public function test_the_permanent_id_resolves_a_roll_shared_by_two_sections(): void
    {
        $s = $this->school('mcqid');
        [, , $url] = $this->linked($s);
        $mineId = Tenancy::as($s['i'], fn () => $s['mine']->fresh()->student_id);
        $sisterId = Tenancy::as($s['i'], fn () => $s['sister']->fresh()->student_id);
        $rows = [['id' => $mineId, 'mcq' => 12], ['id' => strtolower($sisterId), 'roll' => '2', 'mcq' => 14], ['id' => 'NOPE-1', 'roll' => '1', 'mcq' => 3], ['roll' => '1', 'mcq' => 9]];
        $out = $this->api('POST', $s['host'], $url, $s['admin'], ['source' => 'json', 'rows' => $rows, 'save' => true])->assertOk()->json('data');
        $this->assertSame(['ok', 'ok', 'unknown_id', 'ambiguous_roll'], array_column($out['rows'], 'status'));
        $this->assertSame([$mineId, $sisterId], array_slice(array_column($out['rows'], 'id'), 0, 2));
        $marks = Tenancy::as($s['i'], fn () => Result::pluck('component_marks', 'student_id'));
        $this->assertEquals(['mcq' => 12], $marks[$s['mine']->id]);
        $this->assertEquals(['mcq' => 14], $marks[$s['sister']->id]);
    }

    // D159 (5): one class-test sheet of two subjects - each exam subject linked to its block takes only its own rows' marks
    public function test_a_multi_subject_omr_sheet_is_graded_per_subject(): void
    {
        $s = $this->school('mcqblocks');
        $exam = $this->exam($s);
        $paper = $this->blockPaper($s);                                  // Math 2 MCQ, then Physics 3 MCQ, 1 mark each
        $blocks = ['গণিত' => $s['bangla'], 'পদার্থবিজ্ঞান' => $s['physics']];
        foreach ($blocks as $name => $subject) {
            $this->api('PUT', $s['host'], "exams/{$exam}/subjects/{$subject->id}/paper", $s['admin'], ['qb_paper_id' => $paper, 'qb_subject_id' => \App\Models\QbSubject::where('name_bn', $name)->value('id')])->assertOk();
        }
        Tenancy::as($s['i'], function () use ($s, $paper) {
            $variant = \App\Models\QbPaperVariant::where('qb_paper_id', $paper)->orderBy('variant_number')->first();
            $labels = ['ক', 'খ', 'গ', 'ঘ'];
            $right = collect($variant->layout_json)->flatMap(fn ($sec) => $sec['items'])->map(fn ($it) => array_search($it['correct'][0], $labels, true))->values()->all();
            // rows 1-2 math, 3-5 physics; the student gets math 2/2 and physics 1/3
            $answers = array_map(fn ($i) => ['status' => 'marked', 'selected' => [$i === 0 || $i === 1 || $i === 2 ? $right[$i] : ($right[$i] + 1) % 4]], range(0, 4));
            $form = QbOmrForm::create(['qb_paper_id' => $paper, 'code' => 'F2', 'settings_json' => ['marking' => ['question_mark' => '1.00', 'negative_mark_enabled' => false, 'negative_mark' => '0', 'multiple_answer_policy' => 'wrong']], 'layout_version' => 1, 'locked_at' => now()]);
            QbOmrScan::create(['qb_omr_form_id' => $form->id, 'layout_version' => 1, 'set_code' => $variant->code, 'roll' => '2', 'matched_student_id' => $s['other']->id,
                'answers_json' => $answers, 'answered_count' => 5, 'correct_count' => 3, 'obtained_marks' => '3.00', 'status' => 'graded', 'source' => 'upload']);
        });
        foreach (['bangla' => 2, 'physics' => 1] as $key => $expected) {
            $out = $this->api('POST', $s['host'], "exams/{$exam}/subjects/{$s[$key]->id}/mcq-import", $s['admin'], ['source' => 'omr', 'save' => true])->assertOk()->json('data');
            $this->assertSame(1, $out['saved']);
            $this->assertEquals(['mcq' => $expected], Tenancy::as($s['i'], fn () => Result::where('subject_id', $s[$key]->id)->sole()->component_marks), "{$key}: only its own block");
        }
    }
}
