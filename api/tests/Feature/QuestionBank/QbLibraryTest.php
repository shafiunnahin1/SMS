<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbChapter, QbConcept, QbMedia, QbResource, QbSubject, QbTopic, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// QB.5 (D65, docs/modules/question-bank.md §2, §4.1): an institution's teachers read the published concepts and resources on their
// own host. A draft is a 404; without this institution's unlock a concept is its title only and a resource never gives its file
// (its preview pages and page count it does); another institution's unlock opens nothing here. Admin and teacher only, module on.
class QbLibraryTest extends TestCase
{
    use RefreshDatabase;

    private int $topic;
    private QbConcept $concept;
    private QbConcept $draft;
    private QbResource $resource;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        $writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $subject = QbSubject::create(['name_bn' => 'পদার্থ', 'name_en' => 'Physics']);
        $chapter = QbChapter::create(['qb_subject_id' => $subject->id, 'name_bn' => 'গতি', 'name_en' => 'Motion']);
        $this->topic = QbTopic::create(['qb_chapter_id' => $chapter->id, 'name_bn' => 'বেগ', 'name_en' => 'Velocity'])->id;
        $this->concept = QbConcept::create(['qb_topic_id' => $this->topic, 'title_bn' => 'বেগ', 'body_text' => 'SECRET-BODY v = s/t', 'status' => 'published', 'created_by' => $writer->id]);
        $this->draft = QbConcept::create(['qb_topic_id' => $this->topic, 'title_bn' => 'খসড়া', 'body_text' => 'draft', 'status' => 'draft', 'created_by' => $writer->id]);
        $pdf = QbMedia::create(['path' => 'platform/qb/book.pdf', 'mime' => 'application/pdf', 'size_bytes' => 10, 'uploaded_by' => $writer->id]);
        $page = QbMedia::create(['path' => 'platform/qb/page1.png', 'mime' => 'image/png', 'size_bytes' => 10, 'uploaded_by' => $writer->id]);
        $this->resource = QbResource::create(['kind' => 'book', 'title_bn' => 'গতির বই', 'qb_chapter_id' => $chapter->id, 'qb_media_id' => $pdf->id,
            'page_count' => 40, 'status' => 'published', 'created_by' => $writer->id]);
        $this->resource->previews()->attach($page->id);
    }

    private function school(string $slug, bool $unlocked): array
    {
        $i = $this->makeInstitution($slug);
        $teacher = $this->makeUser($i, 'teacher');
        if ($unlocked) Tenancy::as($i, function () use ($teacher) {
            foreach (['concept' => $this->concept->id, 'resource' => $this->resource->id] as $type => $id) {
                QbUnlock::create(['item_type' => $type, 'item_id' => $id, 'unlocked_by' => $teacher->id, 'price' => '0.00', 'reason' => 'free']);
            }
        });
        return [$i, $teacher, $this->hostOf($i)];
    }

    public function test_without_an_unlock_a_teacher_sees_titles_previews_and_page_count_only(): void
    {
        [, $teacher, $host] = $this->school('qblocked', false);
        $this->school('qbopen', true);                                    // another institution has both: nothing opens here

        $list = $this->api('GET', $host, "question-bank/concepts?qb_topic_id={$this->topic}", $teacher)->assertOk()->json('data');
        $this->assertSame([$this->concept->id], array_column($list, 'id'), 'only published concepts');
        $c = $this->api('GET', $host, "question-bank/concepts/{$this->concept->id}", $teacher)->assertOk()->json('data');
        $this->assertFalse($c['unlocked']);
        $this->assertArrayNotHasKey('body_text', $c);
        $this->assertStringNotContainsString('SECRET-BODY', $this->api('GET', $host, "question-bank/concepts/{$this->concept->id}", $teacher)->getContent());

        $r = $this->api('GET', $host, "question-bank/resources/{$this->resource->id}", $teacher)->assertOk()->json('data');
        $this->assertSame([false, 40, 1], [$r['unlocked'], $r['page_count'], count($r['previews'])]);
        $this->assertArrayNotHasKey('file', $r);
        $this->assertStringNotContainsString('book.pdf', $this->api('GET', $host, "question-bank/resources/{$this->resource->id}", $teacher)->getContent());
        $this->assertSame([$this->resource->id], array_column($this->api('GET', $host, 'question-bank/resources?kind=book', $teacher)->json('data'), 'id'));
        $this->assertSame([], $this->api('GET', $host, 'question-bank/resources?kind=slide', $teacher)->json('data'));

        $this->api('GET', $host, "question-bank/concepts/{$this->draft->id}", $teacher)->assertNotFound();
    }

    public function test_with_its_own_unlock_the_institution_reads_the_body_and_the_file(): void
    {
        [, $teacher, $host] = $this->school('qbopen', true);
        $c = $this->api('GET', $host, "question-bank/concepts/{$this->concept->id}", $teacher)->assertOk()->json('data');
        $this->assertSame([true, 'SECRET-BODY v = s/t'], [$c['unlocked'], $c['body_text']]);
        $this->assertTrue($this->api('GET', $host, "question-bank/concepts?qb_topic_id={$this->topic}", $teacher)->json('data.0.unlocked'));
        $r = $this->api('GET', $host, "question-bank/resources/{$this->resource->id}", $teacher)->assertOk()->json('data');
        $this->assertTrue($r['unlocked']);
        $this->assertStringContainsString('book.pdf', $r['file']['url']);
        $this->assertNotEmpty($this->api('GET', $host, 'question-bank/curriculum', $teacher)->assertOk()->json('data.subjects'));
    }

    public function test_only_admin_and_teacher_with_the_module_on(): void
    {
        [$i, $teacher, $host] = $this->school('qbroles', false);
        $this->api('GET', $host, 'question-bank/curriculum', $this->makeUser($i, 'admin'))->assertOk();
        $this->api('GET', $host, 'question-bank/curriculum', $this->makeUser($i, 'accountant'))->assertForbidden();
        $i->forceFill(['enabled_modules' => ['question_bank' => false]])->save();
        $this->api('GET', $host, "question-bank/concepts/{$this->concept->id}", $teacher)->assertForbidden();
        $this->api('GET', 'admin.' . config('tenancy.base_domain'), 'question-bank/curriculum', $teacher)->assertNotFound();
    }
}
