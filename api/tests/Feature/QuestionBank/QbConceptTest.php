<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{AuditLog, QbChapter, QbConcept, QbSubject, QbTopic, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// QB.5 (D65, docs/modules/question-bank.md §3গ): a topic's concept goes through the same review as a question - a writer drafts and
// submits only their own, a moderator publishes or returns it with the reason and edits nothing, every move is audited.
class QbConceptTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $writer;
    private User $moderator;
    private int $topic;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->moderator = User::create(['institution_id' => null, 'name' => 'm', 'role' => 'content_moderator', 'phone' => '01911111111', 'password' => 'Moder-pass-26', 'is_active' => true]);
        $subject = QbSubject::create(['name_bn' => 'পদার্থ', 'name_en' => 'Physics']);
        $chapter = QbChapter::create(['qb_subject_id' => $subject->id, 'name_bn' => 'গতি', 'name_en' => 'Motion']);
        $this->topic = QbTopic::create(['qb_chapter_id' => $chapter->id, 'name_bn' => 'বেগ', 'name_en' => 'Velocity'])->id;
    }

    private function draft(array $extra = []): array
    {
        return $this->api('POST', $this->central, 'writer/concepts', $this->writer, ['qb_topic_id' => $this->topic, 'title_bn' => 'বেগ কী',
            'body_text' => 'বেগ = সরণ / সময়, $v = \\frac{s}{t}$'] + $extra)->assertCreated()->json('data');
    }

    public function test_a_concept_goes_draft_review_rejected_review_published(): void
    {
        $c = $this->draft();
        $this->assertSame('draft', $c['status']);
        $this->api('POST', $this->central, "writer/concepts/{$c['id']}/publish", $this->moderator)->assertStatus(422)->assertJsonPath('error', 'qb_wrong_status');
        $this->api('POST', $this->central, "writer/concepts/{$c['id']}/submit", $this->writer)->assertOk()->assertJsonPath('data.status', 'review');
        $this->api('PUT', $this->central, "writer/concepts/{$c['id']}", $this->writer, ['title_bn' => 'x'])->assertStatus(422);   // in review: locked for the writer
        $this->api('POST', $this->central, "writer/concepts/{$c['id']}/reject", $this->moderator, ['reason' => 'একক লিখুন'])->assertOk()
            ->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.review_note', 'একক লিখুন');
        $this->api('PUT', $this->central, "writer/concepts/{$c['id']}", $this->writer, ['body_text' => 'বেগ = সরণ / সময় (মিটার/সেকেন্ড)'])->assertOk();
        $this->api('POST', $this->central, "writer/concepts/{$c['id']}/submit", $this->writer)->assertOk()->assertJsonPath('data.review_note', null);
        $this->api('POST', $this->central, "writer/concepts/{$c['id']}/publish", $this->moderator)->assertOk()->assertJsonPath('data.status', 'published');

        $this->assertSame(['qb.concept.submitted', 'qb.concept.rejected', 'qb.concept.submitted', 'qb.concept.published'],
            Tenancy::withoutTenancy(fn () => AuditLog::where('model', 'QbConcept')->where('model_id', $c['id'])->orderBy('id')->pluck('action')->all()));
        $this->assertSame($this->moderator->id, QbConcept::find($c['id'])->reviewed_by);
    }

    public function test_who_may_do_what(): void
    {
        $c = $this->draft();
        $other = User::create(['institution_id' => null, 'name' => 'w2', 'role' => 'content_writer', 'phone' => '01822222222', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->api('GET', $this->central, "writer/concepts/{$c['id']}", $other)->assertNotFound();               // another writer's: not even its existence
        $this->assertSame([], $this->api('GET', $this->central, 'writer/concepts', $other)->json('data'));
        $this->api('POST', $this->central, 'writer/concepts', $this->moderator, ['qb_topic_id' => $this->topic, 'title_bn' => 'x', 'body_text' => 'y'])->assertForbidden();
        $this->api('PUT', $this->central, "writer/concepts/{$c['id']}", $this->moderator, ['title_bn' => 'x'])->assertForbidden();
        $this->api('POST', $this->central, "writer/concepts/{$c['id']}/submit", $this->writer)->assertOk();
        $this->api('POST', $this->central, "writer/concepts/{$c['id']}/publish", $this->writer)->assertForbidden();   // a writer never publishes
        $this->assertSame([$c['id']], array_column($this->api('GET', $this->central, 'writer/concepts?status=review', $this->moderator)->json('data'), 'id'));
        $this->api('POST', $this->central, 'writer/concepts', $this->writer, ['qb_topic_id' => $this->topic, 'title_bn' => 'x', 'body_text' => 'y', 'status' => 'published'])
            ->assertStatus(422)->assertJsonValidationErrors('status');
    }

    public function test_pictures_must_be_the_writers_own(): void
    {
        $mine = $this->api('POST', $this->central, 'writer/media', $this->writer, ['file' => UploadedFile::fake()->image('a.png', 50, 50)])->json('data.id');
        $c = $this->draft(['media_ids' => [$mine]]);
        $this->assertSame([$mine], $c['media_ids']);
        $this->assertStringContainsString('platform/qb/', Storage::disk('private')->allFiles()[0]);
        $other = User::create(['institution_id' => null, 'name' => 'w2', 'role' => 'content_writer', 'phone' => '01822222222', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $theirs = $this->api('POST', $this->central, 'writer/media', $other, ['file' => UploadedFile::fake()->image('b.png', 50, 50)])->json('data.id');
        $this->api('PUT', $this->central, "writer/concepts/{$c['id']}", $this->writer, ['media_ids' => [$mine, $theirs]])->assertStatus(422)->assertJsonValidationErrors('media_ids');
    }

    public function test_the_concept_routes_are_central_only(): void
    {
        $i = $this->makeInstitution('qbconcept');
        $this->api('GET', $this->hostOf($i), 'writer/concepts', $this->makeUser($i, 'admin'))->assertNotFound();
    }
}
