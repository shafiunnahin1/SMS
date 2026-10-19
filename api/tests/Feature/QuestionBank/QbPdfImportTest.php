<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbImportBatch, QbImportRecord, QbQuestion, QbSubject, User};
use App\Services\PdfService;
use App\Support\Pdf\PdfQuestionSplitter;
use App\Support\Pdf\PdfTextExtractor;
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// D124 (R2.1.4): PDFs made here with Chromium (Bangla + English, MCQ + creative + short, math, a blank page, a picture-only PDF)
// go through qbank's extraction and splitting rules into the D123 staging: the right questions with their source page, hybrid
// pages listed as unreadable, a scanned PDF stopped as needs_ocr with nothing imported, reject/un-reject, selected-only drafts.
class QbPdfImportTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $writer;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->seed(QbQuestionTypeSeeder::class);
        $this->writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        QbSubject::create(['name_bn' => 'সাধারণ জ্ঞান', 'name_en' => 'General knowledge']);
    }

    /** one HTML page per entry, printed by the app's own Chromium */
    private function pdf(array $pages): string
    {
        $html = '<html><head><meta charset="utf-8"><style>body{font-family:"Noto Sans Bengali","Noto Sans",sans-serif;font-size:14px} .p{page-break-after:always}</style></head><body>'
            . implode('', array_map(fn ($p) => '<div class="p">' . $p . '</div>', $pages)) . '</body></html>';
        $print = new \ReflectionMethod(PdfService::class, 'print');
        return $print->invoke(app(PdfService::class), $html, 'a4', 'portrait');
    }

    private const PAGE_1 = '<p>বহুনির্বাচনী প্রশ্ন</p><p>১. বাংলাদেশের রাজধানী কোনটি?</p><p>ক. ঢাকা খ. চট্টগ্রাম গ. খুলনা ঘ. রাজশাহী</p><p>উত্তর: ক</p>'
        . '<p>2. What is the value of x if x² = 9?</p><p>A. 3</p><p>B. 9</p><p>Answer: A</p>';
    private const PAGE_3 = '<p>সৃজনশীল প্রশ্ন</p><p>৩. উদ্দীপক: একটি আয়তক্ষেত্রের দৈর্ঘ্য প্রস্থের দ্বিগুণ এবং পরিসীমা ৩০ সেমি।</p>'
        . '<p>ক. আয়তক্ষেত্রের পরিসীমার সূত্র লেখো এবং ব্যাখ্যা করো। ১</p><p>খ. আয়তক্ষেত্রটির দৈর্ঘ্য ও প্রস্থ নির্ণয় করো। ২</p>'
        . '<p>গ. আয়তক্ষেত্রটির ক্ষেত্রফল নির্ণয় করো। ৩</p><p>ঘ. আয়তক্ষেত্রটির কর্ণের দৈর্ঘ্য নির্ণয় করো। ৪</p>'
        . '<p>4. Name the largest planet of the solar system.</p><p>Answer: Jupiter</p><p>5. Describe the water cycle briefly.</p>';

    public function test_qbank_rules_split_the_pages_into_questions_with_their_page(): void
    {
        $read = (new PdfTextExtractor)->extract($this->pdf([self::PAGE_1, '<p>.</p>', self::PAGE_3]));
        $this->assertSame(['hybrid', [2], 3], [$read['document_kind'], $read['unreadable_pages'], $read['total_pages']]);
        $q = (new PdfQuestionSplitter)->split($read['pages']);
        $this->assertCount(5, $q);
        $this->assertSame(['mcq', 1, 'বাংলাদেশের রাজধানী কোনটি?'], [$q[0]['question_type'], $q[0]['page_number'], $q[0]['question_text']]);
        $this->assertSame([['ক', 'ঢাকা', true], ['খ', 'চট্টগ্রাম', false]], array_map(fn ($o) => [$o['label'], $o['text'], $o['is_correct']], array_slice($q[0]['options'], 0, 2)));
        $this->assertSame(['mcq', 'A', true], [$q[1]['question_type'], $q[1]['options'][0]['label'], $q[1]['options'][0]['is_correct']]);
        $this->assertSame(['creative', 3, 4], [$q[2]['question_type'], $q[2]['page_number'], count($q[2]['creative_parts'])]);
        $this->assertSame(['ক', 'knowledge', 1], [$q[2]['creative_parts'][0]['label'], $q[2]['creative_parts'][0]['cognitive_level'], $q[2]['creative_parts'][0]['marks']]);
        $this->assertSame(4, $q[2]['creative_parts'][3]['marks']);
        $this->assertSame(['short', 'Jupiter'], [$q[3]['question_type'], $q[3]['answer_text']]);
        $this->assertArrayNotHasKey('question_type', $q[4], 'no answer, no options: the type is left for the writer - not guessed');

        $window = (new PdfTextExtractor)->extract($this->pdf([self::PAGE_1, '<p>.</p>', self::PAGE_3]), 3, 3);
        $this->assertSame([3, 3, 'text'], [$window['page_from'], $window['page_to'], $window['document_kind']]);
    }

    public function test_a_pdf_is_staged_with_page_provenance_and_imported_as_selected_drafts(): void
    {
        $file = UploadedFile::fake()->createWithContent('paper.pdf', $this->pdf([self::PAGE_1, '<p>.</p>', self::PAGE_3]));
        $made = $this->api('POST', $this->central, 'writer/imports', $this->writer, ['pdf' => $file])->assertCreated()->json('data');
        $this->assertSame(['pdf', 'ready', 5, 'hybrid', [2]], [$made['format'], $made['status'], $made['counts']['total'], $made['pdf']['document_kind'], $made['pdf']['unreadable_pages']]);
        $rows = collect($this->api('GET', $this->central, "writer/imports/{$made['id']}/records", $this->writer)->json('data'))->keyBy('record');
        $this->assertSame([1, 1, 3, 3, 3], $rows->pluck('page')->values()->all());
        $this->assertContains('math symbols in the PDF text - check and write them as LaTeX', $rows[2]['warnings']);
        $this->assertTrue($rows[2]['has_math']);
        $this->assertStringContainsString('x² = 9', $rows[2]['payload']['question_text'], 'the PDF text is not rewritten');
        $this->assertSame('question_type', $rows[5]['errors'][0]['path']);

        // every question still needs a subject: bulk settings, then reject one, select the valid ones and import
        $this->api('POST', $this->central, "writer/imports/{$made['id']}/settings", $this->writer, ['record_ids' => $rows->pluck('id')->all(), 'changes' => ['subject' => 'General knowledge']])->assertOk();
        $this->api('POST', $this->central, "writer/imports/{$made['id']}/records/{$rows[4]['id']}/reject", $this->writer, ['rejected' => true])->assertOk()
            ->assertJsonPath('data.errors.0.message', 'rejected by the reviewer');
        $this->api('POST', $this->central, "writer/imports/{$made['id']}/select", $this->writer, ['all_valid' => true, 'selected' => true])->assertJsonPath('changed', 3);
        $done = $this->api('POST', $this->central, "writer/imports/{$made['id']}/finalize", $this->writer)->assertOk()->json('result');
        $this->assertSame(3, $done['imported']);
        $this->assertSame(['draft'], QbQuestion::pluck('status')->unique()->values()->all());
        $this->assertNull(QbImportRecord::find($rows[4]['id'])->qb_question_id, 'a rejected question is never imported');
        $this->api('POST', $this->central, "writer/imports/{$made['id']}/records/{$rows[4]['id']}/reject", $this->writer, ['rejected' => false])->assertOk()->assertJsonPath('data.errors', []);

        $this->assertStringStartsWith('%PDF', $this->api('GET', $this->central, "writer/imports/{$made['id']}/source.pdf", $this->writer)->assertOk()->getContent());
    }

    public function test_a_scanned_pdf_stops_as_needs_ocr_with_nothing_imported(): void
    {
        $file = UploadedFile::fake()->createWithContent('scan.pdf', $this->pdf(['<div style="width:400px;height:300px;background:#888"></div>', '<p>-</p>']));
        $made = $this->api('POST', $this->central, 'writer/imports', $this->writer, ['pdf' => $file])->assertCreated()->json('data');
        $this->assertSame(['needs_ocr', 'scanned', [1, 2], 0], [$made['status'], $made['pdf']['document_kind'], $made['pdf']['unreadable_pages'], $made['counts']['total']]);
        $this->assertStringContainsString('searchable PDF', $made['error']);
        $this->assertSame(0, QbImportRecord::count());
    }

    public function test_bad_pdf_input_is_refused_or_fails_visibly(): void
    {
        $this->api('POST', $this->central, 'writer/imports', $this->writer, ['pdf' => UploadedFile::fake()->createWithContent('x.pdf', 'not a pdf')])->assertStatus(422);
        $file = UploadedFile::fake()->createWithContent('p.pdf', $this->pdf([self::PAGE_1]));
        $this->api('POST', $this->central, 'writer/imports', $this->writer, ['pdf' => $file, 'page_from' => 3, 'page_to' => 2])->assertStatus(422);
        $made = $this->api('POST', $this->central, 'writer/imports', $this->writer, ['pdf' => UploadedFile::fake()->createWithContent('p.pdf', $this->pdf([self::PAGE_1])), 'page_from' => 5])->json('data');
        $this->assertSame('failed', $made['status']);
        $this->assertStringContainsString('after the last page', $made['error']);
    }
}
