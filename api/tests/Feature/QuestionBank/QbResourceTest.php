<?php

namespace Tests\Feature\QuestionBank;

use App\Http\Controllers\QuestionBank\QbResourceController;
use App\Models\{AuditLog, QbChapter, QbSubject, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// QB.5 (D65, docs/modules/question-bank.md §3গ): a slide, book or PDF - a PDF on the platform's private disk, filed under exactly
// one of subject / chapter / topic, with its page count and preview pages - goes through the same review as a question.
class QbResourceTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $writer;
    private User $moderator;
    private int $subject;
    private int $chapter;

    public static function pdf(int $pages): string
    {
        $kids = implode(' ', array_map(fn ($i) => (3 + $i) . ' 0 R', range(0, $pages - 1)));
        $objs = ["1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj", "2 0 obj << /Type /Pages /Kids [{$kids}] /Count {$pages} >> endobj"];
        foreach (range(0, $pages - 1) as $i) $objs[] = (3 + $i) . " 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >> endobj";
        return "%PDF-1.4\n" . implode("\n", $objs) . "\ntrailer << /Root 1 0 R >>\n%%EOF\n";
    }

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->moderator = User::create(['institution_id' => null, 'name' => 'm', 'role' => 'content_moderator', 'phone' => '01911111111', 'password' => 'Moder-pass-26', 'is_active' => true]);
        $this->subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
        $this->chapter = QbChapter::create(['qb_subject_id' => $this->subject, 'name_bn' => 'বীজগণিত', 'name_en' => 'Algebra'])->id;
    }

    private function upload(?User $as = null, int $pages = 3): array
    {
        return $this->api('POST', $this->central, 'writer/resource-files', $as ?? $this->writer,
            ['file' => UploadedFile::fake()->createWithContent('notes.pdf', self::pdf($pages))])->assertCreated()->json('data');
    }

    private function picture(?User $as = null): int
    {
        return $this->api('POST', $this->central, 'writer/media', $as ?? $this->writer, ['file' => UploadedFile::fake()->image('p1.png', 60, 80)])->json('data.id');
    }

    public function test_a_pdf_upload_counts_its_pages_and_stays_private(): void
    {
        $f = $this->upload(pages: 3);
        $this->assertSame(3, $f['page_count']);
        $this->assertSame('application/pdf', $f['mime']);
        $this->assertStringStartsWith('platform/qb/', Storage::disk('private')->allFiles()[0]);
        $this->assertNull(QbResourceController::pages(tempnam(sys_get_temp_dir(), 'qb')));          // nothing readable: the writer types the count
        $fake = UploadedFile::fake()->createWithContent('fake.pdf', "<html>not a pdf</html>");
        $this->api('POST', $this->central, 'writer/resource-files', $this->writer, ['file' => $fake])->assertStatus(422)->assertJsonValidationErrors('file');
        $this->api('POST', $this->central, 'writer/resource-files', $this->moderator, ['file' => UploadedFile::fake()->createWithContent('x.pdf', self::pdf(1))])->assertForbidden();
    }

    public function test_a_resource_goes_through_review_with_its_file_and_previews(): void
    {
        $f = $this->upload();
        $p1 = $this->picture();
        $p2 = $this->picture();
        $r = $this->api('POST', $this->central, 'writer/resources', $this->writer, ['kind' => 'book', 'title_bn' => 'বীজগণিত নোট', 'qb_chapter_id' => $this->chapter,
            'qb_media_id' => $f['id'], 'page_count' => $f['page_count'], 'preview_media_ids' => [$p2, $p1]])->assertCreated()->json('data');
        $this->assertSame(['draft', $this->chapter, null, null, 3], [$r['status'], $r['qb_chapter_id'], $r['qb_subject_id'], $r['qb_topic_id'], $r['page_count']]);
        $this->assertSame([$p2, $p1], $r['preview_media_ids'], 'the preview pages keep the order given');
        $this->assertNotNull($r['file']['url']);

        $this->api('POST', $this->central, "writer/resources/{$r['id']}/submit", $this->writer)->assertOk();
        $shown = $this->api('GET', $this->central, "writer/resources/{$r['id']}", $this->moderator)->assertOk()->json('data');
        $this->assertNotNull($shown['file']['url'], 'the moderator reads the PDF before publishing');
        $this->api('POST', $this->central, "writer/resources/{$r['id']}/reject", $this->moderator, ['reason' => 'ঝাপসা পাতা'])->assertOk();
        $this->api('PUT', $this->central, "writer/resources/{$r['id']}", $this->writer, ['qb_subject_id' => $this->subject])->assertOk()
            ->assertJsonPath('data.qb_subject_id', $this->subject)->assertJsonPath('data.qb_chapter_id', null);       // a new place replaces the old one
        $this->api('POST', $this->central, "writer/resources/{$r['id']}/submit", $this->writer)->assertOk();
        $this->api('POST', $this->central, "writer/resources/{$r['id']}/publish", $this->writer)->assertForbidden();
        $this->api('POST', $this->central, "writer/resources/{$r['id']}/publish", $this->moderator)->assertOk()->assertJsonPath('data.status', 'published');
        $this->assertSame(['qb.resource.submitted', 'qb.resource.rejected', 'qb.resource.submitted', 'qb.resource.published'],
            Tenancy::withoutTenancy(fn () => AuditLog::where('model', 'QbResource')->where('model_id', $r['id'])->orderBy('id')->pluck('action')->all()));
    }

    public function test_the_place_file_and_previews_are_checked(): void
    {
        $f = $this->upload();
        $base = ['kind' => 'pdf', 'title_bn' => 'x', 'qb_media_id' => $f['id'], 'page_count' => 3];
        $this->api('POST', $this->central, 'writer/resources', $this->writer, $base)->assertStatus(422)->assertJsonValidationErrors('qb_subject_id');            // no place
        $this->api('POST', $this->central, 'writer/resources', $this->writer, $base + ['qb_subject_id' => $this->subject, 'qb_chapter_id' => $this->chapter])
            ->assertStatus(422)->assertJsonValidationErrors('qb_subject_id');                                                                                 // two places
        $picture = $this->picture();
        $this->api('POST', $this->central, 'writer/resources', $this->writer, ['qb_media_id' => $picture, 'qb_subject_id' => $this->subject] + $base)
            ->assertStatus(422)->assertJsonValidationErrors('qb_media_id');                                                                                   // a picture is not the PDF
        $this->api('POST', $this->central, 'writer/resources', $this->writer, $base + ['qb_subject_id' => $this->subject, 'preview_media_ids' => [$f['id']]])
            ->assertStatus(422)->assertJsonValidationErrors('preview_media_ids');                                                                             // the PDF is not a preview picture
        $other = User::create(['institution_id' => null, 'name' => 'w2', 'role' => 'content_writer', 'phone' => '01822222222', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $theirs = $this->upload($other);
        $this->api('POST', $this->central, 'writer/resources', $this->writer, ['qb_media_id' => $theirs['id'], 'qb_subject_id' => $this->subject] + $base)
            ->assertStatus(422)->assertJsonValidationErrors('qb_media_id');                                                                                   // another writer's upload
        $this->api('POST', $this->central, 'writer/resources', $this->writer, ['kind' => 'video', 'qb_subject_id' => $this->subject] + $base)->assertStatus(422)->assertJsonValidationErrors('kind');
        $id = $this->api('POST', $this->central, 'writer/resources', $this->writer, $base + ['qb_subject_id' => $this->subject])->assertCreated()->json('data.id');
        $this->api('GET', $this->central, "writer/resources/{$id}", $other)->assertNotFound();
    }
}
