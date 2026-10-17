<?php

namespace Tests\Feature\Exams;

use App\Models\{Exam, ExamSubject, Program, Result, Student, Subject};
use App\Services\ResultService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

// docs/TESTING.md "ResultScoringTest" (grading.md Revision 6.3): the grade comes from the percentage of the subject's own full
// marks; one failed part fails the subject; absent; over the full marks -> 422; one row per (exam, student, subject).
class ResultScoringTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->bindTenant($this->makeInstitution('score'));
    }

    private function es(float $full, ?array $components = null): ExamSubject
    {
        return new ExamSubject(['full_marks' => $full, 'pass_marks' => $full * 0.33, 'components' => $components]);
    }

    #[DataProvider('percentages')]
    public function test_grade_comes_from_percentage_not_from_a_fixed_100(float $got, float $full, string $grade, float $point): void
    {
        $res = app(ResultService::class)->score($this->es($full), $got, null, false);
        $this->assertSame($grade, $res['grade']);
        $this->assertEquals($point, $res['grade_point']);
    }

    public static function percentages(): array
    {
        return [[95, 100, 'A+', 5.00], [20, 25, 'A+', 5.00], [17.5, 25, 'A', 4.00], [55, 100, 'B', 3.00], [7, 25, 'F', 0.00], [20, 100, 'F', 0.00]];
    }

    public function test_failing_one_component_fails_the_subject_whatever_the_total(): void
    {
        $es = new ExamSubject(['full_marks' => 100, 'pass_marks' => 33, 'components' => [
            ['key' => 'written', 'label' => 'লিখিত', 'full' => 70, 'pass' => 23], ['key' => 'mcq', 'label' => 'MCQ', 'full' => 30, 'pass' => 10]]]);
        $res = app(ResultService::class)->score($es, null, ['written' => 69, 'mcq' => 5], false);   // 74 total but MCQ below 10
        $this->assertSame([74.0, false, 'F', 0.0], [$res['marks_obtained'], $res['is_pass'], $res['grade'], (float) $res['grade_point']]);
        $ok = app(ResultService::class)->score($es, null, ['written' => 50, 'mcq' => 22], false);
        $this->assertSame([72.0, true, 'A'], [$ok['marks_obtained'], $ok['is_pass'], $ok['grade']]);
    }

    public function test_absent_over_the_full_marks_and_one_row_per_exam_student_subject(): void
    {
        $svc = app(ResultService::class);
        $absent = $svc->score($this->es(25), 20, null, true);
        $this->assertSame([null, true, 'F', false], [$absent['marks_obtained'], $absent['is_absent'], $absent['grade'], $absent['is_pass']]);
        try {
            $svc->score($this->es(25), 26, null, false);
            $this->fail('expected 422');
        } catch (ValidationException $e) {
            $this->assertSame(422, $e->status);
        }

        $p = Program::create(['name' => 'Class 6']);
        $exam = Exam::create(['name' => 'Weekly', 'program_id' => $p->id, 'academic_year' => 2026, 'exam_type' => 'weekly']);
        $sub = Subject::create(['program_id' => $p->id, 'name' => 'গণিত']);
        ExamSubject::create(['exam_id' => $exam->id, 'subject_id' => $sub->id, 'full_marks' => 25, 'pass_marks' => 9]);
        $s = Student::create(['student_id' => 'S1', 'guardian_phone' => '01700000000']);
        $svc->bulkSaveMarks($exam, $sub->id, [['student_id' => $s->id, 'marks_obtained' => 20]]);
        $svc->bulkSaveMarks($exam, $sub->id, [['student_id' => $s->id, 'marks_obtained' => 12]]);
        $this->assertSame(1, Result::count(), 'saving twice updates the one row');
        $this->assertSame(['48.00', 'C'], [Result::first()->percentage, Result::first()->grade]);
    }
}
