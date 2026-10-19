<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbOmrScan, QbPaper, QbPaperItem, QbPaperSection, QbPaperVariant, QbQuestion, QbQuestionOption, QbQuestionType, QbSubject, User};
use App\Services\PdfService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class QbOmrFormApiTest extends TestCase
{
    use RefreshDatabase;

    private QbQuestion $mcq;

    protected function setUp(): void
    {
        parent::setUp();

        $super = User::create(['institution_id' => null, 'name' => 'super', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $this->mcq = QbQuestion::create([
            'qb_question_type_id' => $type->id,
            'qb_subject_id' => $subject->id,
            'question_text' => '২ + ২ = ?',
            'status' => 'published',
            'created_by' => $super->id,
        ]);
        foreach (['৪' => true, '৩' => false, '৫' => false, '৬' => false] as $text => $correct) {
            QbQuestionOption::create(['qb_question_id' => $this->mcq->id, 'label' => 'x', 'content_text' => $text, 'is_correct' => $correct]);
        }
    }

    private function paper($institution, User $creator, string $status = 'final'): int
    {
        return Tenancy::as($institution, function () use ($institution, $creator, $status) {
            $paper = QbPaper::create(['institution_id' => $institution->id, 'created_by' => $creator->id, 'title' => 'Final assessment', 'status' => $status, 'total_marks' => '1.00']);
            $section = QbPaperSection::create(['institution_id' => $institution->id, 'qb_paper_id' => $paper->id, 'title' => 'MCQ', 'sort_order' => 0]);
            QbPaperItem::create(['institution_id' => $institution->id, 'qb_paper_section_id' => $section->id, 'qb_question_id' => $this->mcq->id, 'marks' => '1.00', 'sort_order' => 0]);
            return $paper->id;
        });
    }

    private function settings(array $overrides = []): array
    {
        return array_replace_recursive([
            'title' => 'Final OMR',
            'roll_digits' => 6,
            'option_count' => 4,
            'option_language' => 'bangla',
            'info_boxes' => ['class' => true, 'roll' => true, 'subject' => true, 'set' => true],
            'page_size' => 'a4',
            'page_orientation' => 'portrait',
            'answer_columns' => 'auto',
            'question_mark' => '1.00',
            'negative_mark_enabled' => true,
            'negative_mark' => '0.25',
            'multiple_answer_policy' => 'wrong',
        ], $overrides);
    }

    private function multipartApi(string $host, string $path, User $as, array $data): TestResponse
    {
        $this->app['auth']->forgetGuards();
        return $this->withHeaders(['Authorization' => 'Bearer ' . $as->createToken('omr-batch')->plainTextToken])
            ->post("http://{$host}/api/v1/" . ltrim($path, '/'), $data);
    }

    public function test_teacher_owns_form_and_generate_locks_until_unlock_creates_a_new_version(): void
    {
        $institution = $this->makeInstitution('omr-form-api');
        $teacher = $this->makeUser($institution, 'teacher');
        $otherTeacher = User::create(['institution_id' => $institution->id, 'name' => 'other', 'email' => 'other-omr@example.test', 'role' => 'teacher', 'password' => 'Teacher-pass-26', 'is_active' => true]);
        $admin = $this->makeUser($institution, 'admin');
        $paperId = $this->paper($institution, $teacher);
        $url = "question-bank/papers/{$paperId}/omr-form";

        $this->api('PUT', $this->hostOf($institution), $url, $teacher, ['settings' => $this->settings()])
            ->assertJsonPath('data.layout_version', 1)->assertJsonPath('data.settings.option_labels.0', 'ক');
        $this->api('GET', $this->hostOf($institution), $url, $otherTeacher)->assertNotFound();
        $this->api('GET', $this->hostOf($institution), $url, $admin)->assertOk();

        $this->api('POST', $this->hostOf($institution), "{$url}/generate", $teacher)->assertOk()
            ->assertJsonPath('data.settings.is_generated', true)
            ->assertJsonPath('data.settings.geometry.version', 2)
            ->assertJsonPath('data.settings.geometry.coordinate_space', 'omr-page-normalized')
            ->assertJsonPath('data.settings.geometry.code.bits.27.width', fn ($width) => $width > 0)
            ->assertJsonPath('data.settings.geometry.roll.rows.9.5.bubble.width', fn ($width) => $width > 0)
            ->assertJsonPath('data.settings.geometry.answers.column_count', 1);
        $this->api('PUT', $this->hostOf($institution), $url, $teacher, ['settings' => $this->settings(['title' => 'Changed'])])->assertStatus(422);
        $this->api('POST', $this->hostOf($institution), "{$url}/unlock", $teacher)
            ->assertOk()->assertJsonPath('data.layout_version', 2)->assertJsonPath('data.locked_at', null)
            ->assertJsonPath('data.settings.is_generated', false)->assertJsonPath('data.settings.geometry', null);
        $this->api('PUT', $this->hostOf($institution), $url, $teacher, ['settings' => $this->settings(['title' => 'New layout'])])
            ->assertOk()->assertJsonPath('data.settings.title', 'New layout');
    }

    public function test_form_requires_final_paper_and_matching_mcq_option_counts(): void
    {
        $institution = $this->makeInstitution('omr-form-invalid');
        $teacher = $this->makeUser($institution, 'teacher');
        $draftId = $this->paper($institution, $teacher, 'draft');
        $this->api('PUT', $this->hostOf($institution), "question-bank/papers/{$draftId}/omr-form", $teacher, ['settings' => $this->settings()])
            ->assertStatus(422)->assertJsonPath('error', 'qb_omr_paper_not_final');

        $finalId = $this->paper($institution, $teacher);
        $this->api('PUT', $this->hostOf($institution), "question-bank/papers/{$finalId}/omr-form", $teacher,
            ['settings' => $this->settings(['option_count' => 5])])->assertStatus(422)->assertJsonPath('error', 'qb_omr_option_mismatch');
    }

    public function test_generated_sheet_is_printed_for_the_selected_final_paper_variant(): void
    {
        $institution = $this->makeInstitution('omr-form-pdf');
        $teacher = $this->makeUser($institution, 'teacher');
        $paperId = $this->paper($institution, $teacher);
        Tenancy::as($institution, fn () => QbPaperVariant::create([
            'institution_id' => $institution->id,
            'qb_paper_id' => $paperId,
            'variant_number' => 1,
            'code' => 'A',
            'strategy' => 'serial',
            'layout_json' => ['question_order' => [$this->mcq->id], 'option_order' => []],
        ]));
        $baseUrl = "question-bank/papers/{$paperId}/omr-form";
        $this->api('PUT', $this->hostOf($institution), $baseUrl, $teacher, ['settings' => $this->settings()])->assertOk();
        $this->api('POST', $this->hostOf($institution), "{$baseUrl}/generate", $teacher)->assertOk();

        $renderer = $this->mock(PdfService::class);
        $renderer->shouldReceive('renderOmr')->once()->withArgs(fn ($view, $data, $size, $orientation) =>
            $view === 'pdf.qb-omr-sheet'
            && $data['variant']->code === 'A'
            && $data['settings']['geometry']['version'] === 2
            && $size === 'a4'
            && $orientation === 'portrait'
        )->andReturn('%PDF-OMR');

        $response = $this->api('GET', $this->hostOf($institution), "{$baseUrl}/pdf?set=A", $teacher)
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertSee('%PDF-OMR', false);
        $this->assertStringStartsWith('inline; filename="omr-', $response->headers->get('Content-Disposition'));
        $this->assertStringEndsWith('-A.pdf"', $response->headers->get('Content-Disposition'));
    }

    public function test_batch_scan_upload_saves_valid_sheets_privately_and_keeps_duplicates_for_review(): void
    {
        Storage::fake('private');
        $institution = $this->makeInstitution('omr-scan-batch');
        $teacher = $this->makeUser($institution, 'teacher');
        $paperId = $this->paper($institution, $teacher);
        Tenancy::as($institution, fn () => QbPaperVariant::create([
            'institution_id' => $institution->id,
            'qb_paper_id' => $paperId,
            'variant_number' => 1,
            'code' => 'A',
            'strategy' => 'serial',
            'layout_json' => ['question_order' => [$this->mcq->id], 'option_order' => []],
        ]));
        $baseUrl = "question-bank/papers/{$paperId}/omr-form";
        $this->api('PUT', $this->hostOf($institution), $baseUrl, $teacher, ['settings' => $this->settings()])->assertOk();
        $this->api('POST', $this->hostOf($institution), "{$baseUrl}/generate", $teacher)->assertOk();
        $validScan = fn (string $clientId) => [
            'client_id' => $clientId,
            'source' => 'upload',
            'set_code' => 'A',
            'roll' => '001234',
            'answers' => [['selected' => [0]]],
            'image' => UploadedFile::fake()->image("{$clientId}.png", 64, 64),
        ];

        $response = $this->multipartApi($this->hostOf($institution), "{$baseUrl}/scans", $teacher, [
            'scans' => [$validScan('sheet-1'), $validScan('sheet-2'), [
                'client_id' => 'sheet-bad',
                'source' => 'upload',
                'set_code' => 'A',
                'roll' => '009999',
                'answers' => [],
                'image' => UploadedFile::fake()->image('sheet-bad.png', 64, 64),
            ]],
        ])->assertOk()
            ->assertJsonPath('data.summary', ['requested' => 3, 'saved' => 2, 'failed' => 1])
            ->assertJsonPath('data.results.0.status', 'saved')
            ->assertJsonPath('data.results.0.scan.status', 'needs_review')
            ->assertJsonPath('data.results.0.scan.answered_count', 1)
            ->assertJsonPath('data.results.1.scan.comparison.requires_manual_review', true)
            ->assertJsonPath('data.results.1.scan.comparison.reason_codes.1', 'duplicate_roll')
            ->assertJsonPath('data.results.2.status', 'failed');

        $this->assertSame(2, Tenancy::as($institution, fn () => QbOmrScan::whereHas('form', fn ($query) => $query->where('qb_paper_id', $paperId))->count()));
        $this->assertCount(2, Storage::disk('private')->allFiles("institutions/{$institution->id}/question-bank/omr"));
    }
}