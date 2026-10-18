<?php

namespace Tests\Feature\Exams;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/TESTING.md "ParentResultAccessTest": only PUBLISHED exams; a parent of two children gets each child's own; another
// child (same institution or another) is a 404.
class ParentResultAccessTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_a_parent_sees_only_published_results_of_their_own_children(): void
    {
        $s = $this->school('pra');
        $id = $this->exam($s);
        $marks = fn ($sid, $m) => $this->api('POST', $s['host'], 'results/bulk', $s['admin'], ['exam_id' => $id, 'subject_id' => $s['bangla']->id,
            'rows' => [['student_id' => $sid, 'marks_obtained' => $m]]])->assertOk();
        $marks($s['mine']->id, 85);
        $marks($s['sister']->id, 50);
        $marks($s['other']->id, 70);
        $this->api('POST', $s['host'], 'results/bulk', $s['admin'], ['exam_id' => $id, 'subject_id' => $s['physics']->id,
            'rows' => [['student_id' => $s['mine']->id, 'components' => ['written' => 60, 'mcq' => 25]]]])->assertOk();

        $mine = fn () => $this->api('GET', $s['host'], "parent/children/{$s['mine']->id}/results", $s['parent'])->assertOk();
        $this->assertSame([], $mine()->json('data.exams'), 'not published yet: nothing');

        $this->api('POST', $s['host'], "exams/{$id}/publish", $s['admin'])->assertOk();
        $exam = $mine()->json('data.exams.0');
        $this->assertSame(['Mine', 'Half yearly'], [$exam['student']['name'], $exam['exam']['name']]);
        $this->assertSame([['বাংলা', '85.00', 'A+'], ['পদার্থবিজ্ঞান', '85.00', 'A+']], array_map(fn ($r) => [$r['subject'], $r['marks_obtained'], $r['grade']], $exam['subjects']));
        $this->assertSame([200, 170, 85, true, 5], [$exam['total']['full_marks'], $exam['total']['obtained'], $exam['total']['percentage'], $exam['total']['is_pass'], $exam['total']['gpa']]);

        $sister = $this->api('GET', $s['host'], "parent/children/{$s['sister']->id}/results", $s['parent'])->assertOk()->json('data.exams.0');
        $this->assertSame(['Sister', '50.00'], [$sister['student']['name'], $sister['subjects'][0]['marks_obtained']]);
        $this->assertNull($sister['total']['gpa'], 'Physics not entered yet: no GPA');

        $this->api('GET', $s['host'], "parent/children/{$s['other']->id}/results", $s['parent'])->assertNotFound();
        $foreign = $this->school('pra2');
        $this->api('GET', $s['host'], "parent/children/{$foreign['mine']->id}/results", $s['parent'])->assertNotFound();
        $this->api('GET', $s['host'], "parent/children/{$s['mine']->id}/results", $s['admin'])->assertForbidden();
    }
}
