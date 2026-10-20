<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{Batch, Enrollment, Program, QbOmrScan, QbPaper, QbPaperItem, QbPaperSection, QbPaperVariant, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, Student, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// D127 (4)/(5), R2.1.6: every sheet is reviewed before it counts; uncertain data is never scored; grading uses the frozen set key
class QbOmrReviewTest extends TestCase
{
    use RefreshDatabase;

    private array $q = [];

    protected function setUp(): void
    {
        parent::setUp();
        $super = User::create(['institution_id' => null, 'name' => 'super', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        foreach ([0, 1] as $n) {
            $q = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => "Q{$n}", 'status' => 'published', 'created_by' => $super->id]);
            foreach ([0, 1, 2, 3] as $o) QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'x', 'content_text' => "o{$o}", 'is_correct' => $o === $n, 'sort_order' => $o]);
            $this->q[] = $q->id;
        }
    }

    /** a final paper of a program with two MCQs; set A keeps the order, set B swaps the questions (keys frozen as labels) */
    private function setup_paper($institution, User $teacher): array
    {
        return Tenancy::as($institution, function () use ($institution, $teacher) {
            $program = Program::create(['name' => 'Class 8']);
            $batch = Batch::create(['program_id' => $program->id, 'name' => 'A']);
            $paper = QbPaper::create(['institution_id' => $institution->id, 'created_by' => $teacher->id, 'program_id' => $program->id, 'title' => 'Test', 'status' => 'final', 'total_marks' => '2.00']);
            $section = QbPaperSection::create(['institution_id' => $institution->id, 'qb_paper_id' => $paper->id, 'title' => 'MCQ', 'sort_order' => 0]);
            foreach ($this->q as $i => $id) QbPaperItem::create(['institution_id' => $institution->id, 'qb_paper_section_id' => $section->id, 'qb_question_id' => $id, 'marks' => '1.00', 'sort_order' => $i]);
            $item = fn ($id, $right) => ['qb_question_id' => $id, 'marks' => '1.00', 'options' => [0, 1, 2, 3], 'correct' => [$right]];
            QbPaperVariant::create(['qb_paper_id' => $paper->id, 'variant_number' => 1, 'code' => 'A', 'strategy' => 'serial', 'layout_json' => [['section_id' => $section->id, 'items' => [$item($this->q[0], 'ক'), $item($this->q[1], 'খ')]]]]);
            QbPaperVariant::create(['qb_paper_id' => $paper->id, 'variant_number' => 2, 'code' => 'B', 'strategy' => 'serial', 'layout_json' => [['section_id' => $section->id, 'items' => [$item($this->q[1], 'খ'), $item($this->q[0], 'ক')]]]]);
            $student = Student::create(['student_id' => 'S1', 'guardian_phone' => '01700000000']);
            Enrollment::create(['student_id' => $student->id, 'program_id' => $program->id, 'batch_id' => $batch->id, 'roll_no' => 7, 'status' => 'active', 'enrolled_at' => '2026-10-01']);
            return [$paper->id, $student->id];
        });
    }

    private function upload($institution, User $teacher, int $paperId, array $scans)
    {
        $this->app['auth']->forgetGuards();
        return $this->withHeaders(['Authorization' => 'Bearer ' . $teacher->createToken('omr')->plainTextToken])
            ->post("http://{$this->hostOf($institution)}/api/v1/question-bank/papers/{$paperId}/omr-form/scans", ['scans' => $scans]);
    }

    private function sheet(string $id, ?string $roll, ?string $set, array $answers): array
    {
        return ['client_id' => $id, 'source' => 'camera', 'roll' => $roll, 'set_code' => $set,
            'answers' => array_map(fn ($s) => ['selected' => $s], $answers), 'image' => UploadedFile::fake()->image("{$id}.png", 32, 32)];
    }

    public function test_review_match_grade_duplicate_and_csv(): void
    {
        Storage::fake('private');
        $institution = $this->makeInstitution('omr-review');
        $teacher = $this->makeUser($institution, 'teacher');
        [$paperId, $studentId] = $this->setup_paper($institution, $teacher);
        $host = $this->hostOf($institution);
        $base = "question-bank/papers/{$paperId}/omr-form";
        $this->api('PUT', $host, $base, $teacher, ['settings' => [
            'title' => 'OMR', 'roll_digits' => 4, 'option_count' => 4, 'option_language' => 'bangla',
            'info_boxes' => ['class' => true, 'roll' => true, 'subject' => true, 'set' => true], 'page_size' => 'a4', 'page_orientation' => 'portrait',
            'answer_columns' => 'auto', 'question_mark' => '1.00', 'negative_mark_enabled' => true, 'negative_mark' => '0.25', 'multiple_answer_policy' => 'wrong',
        ]])->assertOk();
        $this->api('POST', $host, "{$base}/generate", $teacher)->assertOk();

        // set B: row 1 = q1 (key খ = 1), row 2 = q0 (key ক = 0); one right, one wrong
        $r = $this->upload($institution, $teacher, $paperId, [$this->sheet('a', '0007', 'B', [[1], [2]]), $this->sheet('b', '0007', 'Z', [[], [0, 1]])])->assertOk();
        $r->assertJsonPath('data.summary.saved', 2)
            ->assertJsonPath('data.results.0.scan.matched_student_id', $studentId)
            ->assertJsonPath('data.results.0.scan.comparison.reason_codes', []);
        $second = $r->json('data.results.1.scan.id');
        $this->assertEqualsCanonicalizing(['set_code_unknown', 'answers_need_review', 'duplicate_roll'], $r->json('data.results.1.scan.comparison.reason_codes'));

        // nothing is scored while uncertain
        $this->api('POST', $host, "question-bank/omr-scans/{$second}/approve", $teacher)->assertStatus(422)->assertJsonPath('error', 'qb_omr_unresolved');

        $first = $r->json('data.results.0.scan.id');
        $this->api('POST', $host, "question-bank/omr-scans/{$first}/approve", $teacher)->assertStatus(422);   // the roll is now on two sheets
        $this->api('PUT', $host, "question-bank/omr-scans/{$first}", $teacher, ['duplicate_decision' => 'keep_both'])->assertOk();
        $this->api('POST', $host, "question-bank/omr-scans/{$first}/approve", $teacher)->assertOk()
            ->assertJsonPath('data.status', 'graded')->assertJsonPath('data.correct_count', 1)->assertJsonPath('data.obtained_marks', '0.75');

        $this->api('PUT', $host, "question-bank/omr-scans/{$second}", $teacher, ['set_code' => 'A', 'answers' => ['1' => ['selected' => [], 'confirmed' => true], '2' => ['selected' => [1], 'confirmed' => true]]])
            ->assertOk()->assertJsonPath('data.comparison.reason_codes', ['duplicate_roll']);
        $this->api('PUT', $host, "question-bank/omr-scans/{$second}", $teacher, ['duplicate_decision' => 'update'])->assertOk()->assertJsonPath('data.comparison.reason_codes', []);
        $this->api('POST', $host, "question-bank/omr-scans/{$second}/approve", $teacher)->assertOk()->assertJsonPath('data.obtained_marks', '1.00');
        $this->assertSame('superseded', Tenancy::as($institution, fn () => QbOmrScan::find($first)->status));
        $this->api('PUT', $host, "question-bank/omr-scans/{$second}", $teacher, ['roll' => '8'])->assertStatus(422)->assertJsonPath('error', 'qb_omr_scan_closed');

        $this->api('GET', $host, "{$base}/scans", $teacher)->assertOk()->assertJsonCount(2, 'data');
        $this->api('GET', $host, "{$base}/scans?status=graded", $teacher)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $second)->assertJsonPath('meta.total', 1);
        $this->api('GET', $host, "question-bank/omr-scans/{$second}/image", $teacher)->assertOk()->assertHeader('Cache-Control', 'no-store, private');
        $csv = $this->api('GET', $host, "{$base}/results.csv", $teacher)->assertOk()->getContent();
        $this->assertStringContainsString("graded,1,1,1.00", $csv);
        $this->assertStringContainsString('superseded', $csv);

        // another tenant's teacher never sees the sheet
        $other = $this->makeInstitution('omr-review-x');
        $stranger = $this->makeUser($other, 'teacher');
        $this->api('PUT', $this->hostOf($other), "question-bank/omr-scans/{$second}", $stranger, ['roll' => 'x'])->assertNotFound();
        $this->api('GET', $this->hostOf($other), "question-bank/omr-scans/{$second}/image", $stranger)->assertNotFound();
    }

    public function test_unmatched_roll_needs_an_enrolled_student_and_cancel_scores_nothing(): void
    {
        Storage::fake('private');
        $institution = $this->makeInstitution('omr-review2');
        $teacher = $this->makeUser($institution, 'teacher');
        [$paperId, $studentId] = $this->setup_paper($institution, $teacher);
        $host = $this->hostOf($institution);
        $base = "question-bank/papers/{$paperId}/omr-form";
        $this->api('PUT', $host, $base, $teacher, ['settings' => [
            'title' => 'OMR', 'roll_digits' => 4, 'option_count' => 4, 'option_language' => 'bangla',
            'info_boxes' => ['class' => true, 'roll' => true, 'subject' => true, 'set' => true], 'page_size' => 'a4', 'page_orientation' => 'portrait',
            'answer_columns' => 'auto', 'question_mark' => '1.00', 'negative_mark_enabled' => false, 'negative_mark' => '0.00', 'multiple_answer_policy' => 'correct_if_any',
        ]])->assertOk();
        $this->api('POST', $host, "{$base}/generate", $teacher)->assertOk();
        $r = $this->upload($institution, $teacher, $paperId, [$this->sheet('a', '99', null, [[0, 1], [1]]), $this->sheet('b', '7?', 'A', [[0], [1]])])->assertOk();
        $a = $r->json('data.results.0.scan.id');
        $this->assertEqualsCanonicalizing(['set_code_missing', 'answers_need_review', 'student_unmatched'], $r->json('data.results.0.scan.comparison.reason_codes'));
        $this->assertContains('roll_unreadable', $r->json('data.results.1.scan.comparison.reason_codes'));

        $outsider = Tenancy::as($institution, fn () => Student::create(['student_id' => 'S2', 'guardian_phone' => '01700000001'])->id);
        $this->api('PUT', $host, "question-bank/omr-scans/{$a}", $teacher, ['student_id' => $outsider])->assertStatus(422)->assertJsonPath('error', 'qb_omr_student_outside');
        $this->api('PUT', $host, "question-bank/omr-scans/{$a}", $teacher, ['student_id' => $studentId, 'set_resolution' => 'main', 'answers' => ['1' => ['selected' => [0, 1], 'confirmed' => true]]])
            ->assertOk()->assertJsonPath('data.comparison.reason_codes', []);
        $this->api('POST', $host, "question-bank/omr-scans/{$a}/approve", $teacher)->assertOk()->assertJsonPath('data.correct_count', 2)->assertJsonPath('data.obtained_marks', '2.00');

        $b = $r->json('data.results.1.scan.id');
        $this->api('POST', $host, "question-bank/omr-scans/{$b}/cancel", $teacher)->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.obtained_marks', '0.00');
    }
}
