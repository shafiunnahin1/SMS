<?php

namespace Tests\Feature\Madrasa;

use App\Support\{GradingScale, Tenancy};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D214 MAD.4 (docs/modules/madrasa.md section 5): the default scale is untouched; the `labelled` preset starts with empty ranges
// and, until they are filled, marks cannot be graded and results cannot be published (`grading_incomplete`); filled ranges must go
// down; grades keep their codes and are shown with label[locale] ?? grade; back to bd_gpa restores the default.
class GradeLabelTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_preset_stop_ranges_and_labels(): void
    {
        Queue::fake();
        $s = $this->school('grade');
        $h = $s['host'];
        $admin = $s['admin'];
        $exam = $this->exam($s);
        $marks = fn (int $m) => $this->api('POST', $h, 'results/bulk', $admin, ['exam_id' => $exam, 'subject_id' => $s['bangla']->id, 'rows' => [['student_id' => $s['mine']->id, 'marks_obtained' => $m]]]);

        // default: bd_gpa, nothing stored
        $g = $this->api('GET', $h, 'admin/settings/general', $admin)->assertOk()->json('data.grading');
        $this->assertSame(['bd_gpa', false, 'A+'], [$g['preset'], $g['incomplete'], $g['rows'][0]['grade']]);
        $marks(85)->assertOk()->assertJsonPath('data.0.grade', 'A+');

        // the labelled preset: empty ranges -> no grading, no publishing
        $g = $this->api('PUT', $h, 'admin/settings/general', $admin, ['grading' => ['preset' => 'labelled']])->assertOk()->json('data.grading');
        $this->assertSame(['labelled', true], [$g['preset'], $g['incomplete']]);
        $this->assertSame(['MUM', 'JJ', 'JAY', 'MAQ', 'F'], array_column($g['rows'], 'grade'));
        $this->assertSame([null, null, null, null, 0], array_column($g['rows'], 'min'));
        $marks(85)->assertStatus(422)->assertJsonPath('error', 'grading_incomplete');
        $this->api('POST', $h, "exams/{$exam}/publish", $admin)->assertStatus(422)->assertJsonPath('error', 'grading_incomplete');

        // ranges: only the preset's codes, 0..100, going down; a custom label is kept
        $rows = fn (array $mins) => array_map(fn ($c, $m) => ['grade' => $c, 'min' => $m], ['MUM', 'JJ', 'JAY', 'MAQ'], $mins);
        $this->api('PUT', $h, 'admin/settings/general', $admin, ['grading' => ['preset' => 'labelled', 'rows' => [['grade' => 'A+', 'min' => 80]]]])->assertStatus(422);
        $this->api('PUT', $h, 'admin/settings/general', $admin, ['grading' => ['preset' => 'labelled', 'rows' => $rows([80, 101, 50, 33])]])->assertStatus(422);
        $this->api('PUT', $h, 'admin/settings/general', $admin, ['grading' => ['preset' => 'labelled', 'rows' => $rows([80, 85, 50, 33])]])->assertStatus(422)->assertJsonPath('error', 'grading_order');
        $filled = $rows([80, 65, 50, 33]);
        $filled[0]['label'] = ['bn' => 'মুমতাজ (প্রথম বিভাগ)'];
        $g = $this->api('PUT', $h, 'admin/settings/general', $admin, ['grading' => ['preset' => 'labelled', 'rows' => $filled]])->assertOk()->json('data.grading');
        $this->assertFalse($g['incomplete']);
        $this->assertSame(['মুমতাজ (প্রথম বিভাগ)', 'ممتاز'], [$g['rows'][0]['label']['bn'], $g['rows'][0]['label']['ar']]);

        // grading works with the codes; the percentage -> grade rule is the same top-down one
        $marks(85)->assertOk()->assertJsonPath('data.0.grade', 'MUM');
        $marks(70)->assertOk()->assertJsonPath('data.0.grade', 'JJ');
        $marks(20)->assertOk()->assertJsonPath('data.0.grade', 'F');
        $marks(55)->assertOk()->assertJsonPath('data.0.grade', 'JAY');

        // shown with label[locale] ?? grade
        $this->bindTenant($s['i']->fresh());
        $this->assertSame(['জায়্যিদ', 'جيد', 'Jayyid', 'রাসিব', 'ZZ'], [GradingScale::label('JAY', 'bn'), GradingScale::label('JAY', 'ar'), GradingScale::label('JAY', 'en'), GradingScale::label('F', 'bn'), GradingScale::label('ZZ', 'bn')]);
        $sheet = $this->api('GET', $h, "results/marksheet/{$s['mine']->id}?exam_id={$exam}&format=json", $admin)->assertOk()->json('data');
        $bangla = collect($sheet['subjects'])->firstWhere('grade', 'JAY');
        $this->assertSame('জায়্যিদ', $bangla['grade_label']);
        $this->api('POST', $h, "exams/{$exam}/publish", $admin)->assertOk();

        // back to the default scale
        $g = $this->api('PUT', $h, 'admin/settings/general', $admin, ['grading' => ['preset' => 'bd_gpa']])->assertOk()->json('data.grading');
        $this->assertSame(['bd_gpa', 'A+'], [$g['preset'], $g['rows'][0]['grade']]);
        $this->assertArrayNotHasKey('grading_scale', $s['i']->fresh()->settings);
        $this->api('PUT', $h, 'admin/settings/general', $s['karimUser'], ['grading' => ['preset' => 'labelled']])->assertForbidden();
    }
}
