<?php

namespace Tests\Feature\Exams;

use App\Models\Result;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D158 (2) + coaching-private-batch.md "Merit List": rank by the percentage over all the exam's full marks, a tie shares the rank,
// a student without marks is listed last without a rank; a batch filter narrows the list
class MeritListTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_ranks_by_percentage_with_shared_ranks_and_a_batch_filter(): void
    {
        $s = $this->school('merit');
        $exam = $this->exam($s);                                          // Bangla 100 + Physics 100 = 200
        Tenancy::as($s['i'], function () use ($s, $exam) {
            foreach ([['mine', 80, 70], ['sister', 90, 60]] as [$k, $b, $p]) {
                Result::create(['exam_id' => $exam, 'student_id' => $s[$k]->id, 'subject_id' => $s['bangla']->id, 'marks_obtained' => $b]);
                Result::create(['exam_id' => $exam, 'student_id' => $s[$k]->id, 'subject_id' => $s['physics']->id, 'marks_obtained' => $p]);
            }
        });
        $data = $this->api('GET', $s['host'], "exams/{$exam}/merit-list", $s['admin'])->assertOk()->json('data');
        $this->assertEquals(200, $data['full_marks']);
        $rows = collect($data['rows'])->keyBy('student_id');
        $this->assertEquals([150, 75, 1], [$rows[$s['mine']->id]['total'], $rows[$s['mine']->id]['percentage'], $rows[$s['mine']->id]['rank']]);
        $this->assertSame(1, $rows[$s['sister']->id]['rank'], 'a tie shares the rank');
        $this->assertNull($rows[$s['other']->id]['rank'], 'no marks yet - no rank');
        $this->assertSame($s['other']->id, end($data['rows'])['student_id'], 'listed last');

        $onlyB = $this->api('GET', $s['host'], "exams/{$exam}/merit-list?batch_id={$s['b']->id}", $s['admin'])->assertOk()->json('data.rows');
        $this->assertSame([$s['sister']->id], array_column($onlyB, 'student_id'));
        $this->api('GET', $s['host'], "exams/{$exam}/merit-list", $s['karimUser'])->assertForbidden();
    }
}
