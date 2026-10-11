<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{AuditLog, QbChapter, QbQuestion, QbQuestionRevision, QbQuestionType, QbSubject, QbTopic, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// QB.2 (D65, docs/modules/question-bank.md §1): the writers' panel. A writer drafts, edits only their own draft / rejected
// question, and submits; a writer can never publish; a moderator publishes or rejects with a reason that goes back to the writer;
// every save is a revision; an institution sees the question only once it is published.
class QbReviewTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $writer;
    private User $moderator;
    private array $place;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->writer = $this->platformUser('content_writer', 'w1');
        $this->moderator = $this->platformUser('content_moderator', 'm1');
        $subject = QbSubject::create(['name_bn' => 'পদার্থ', 'name_en' => 'Physics']);
        $chapter = QbChapter::create(['qb_subject_id' => $subject->id, 'name_bn' => 'গতি', 'name_en' => 'Motion']);
        $topic = QbTopic::create(['qb_chapter_id' => $chapter->id, 'name_bn' => 'দ্রুতি', 'name_en' => 'Speed']);
        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short']);
        $this->place = ['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'qb_topic_id' => $topic->id];
    }

    private function platformUser(string $role, string $tag): User
    {
        return User::create(['institution_id' => null, 'name' => $tag, 'role' => $role, 'phone' => '0171' . str_pad((string) crc32($tag) % 10000000, 7, '0', STR_PAD_LEFT),
            'password' => 'Writer-pass-26', 'is_active' => true]);
    }

    private function draft(User $as, string $text = 'What is speed?'): int
    {
        return $this->api('POST', $this->central, 'writer/questions', $as, $this->place + ['question_text' => $text, 'answer_text' => 'distance / time'])
            ->assertCreated()->assertJsonPath('data.status', 'draft')->json('data.id');
    }

    public function test_draft_review_reject_resubmit_publish(): void
    {
        $id = $this->draft($this->writer);
        $q = QbQuestion::find($id);
        $this->assertSame([$this->writer->id, $this->place['qb_topic_id']], [$q->created_by, $q->qb_topic_id]);
        $this->assertNotNull($q->qb_chapter_id, 'the topic fills in its chapter');

        $this->api('PUT', $this->central, "writer/questions/{$id}", $this->writer, ['question_text' => 'What is speed? (SI)'])->assertOk();
        $this->assertSame(2, QbQuestionRevision::where('qb_question_id', $id)->count(), 'every save is a revision');

        // a writer can never publish, and cannot move a draft past review
        $this->api('POST', $this->central, "writer/questions/{$id}/publish", $this->writer)->assertForbidden();
        $this->api('POST', $this->central, "writer/questions/{$id}/publish", $this->moderator)->assertStatus(422)->assertJsonPath('error', 'qb_wrong_status');

        $this->api('POST', $this->central, "writer/questions/{$id}/submit", $this->writer)->assertOk()->assertJsonPath('data.status', 'review');
        $this->api('PUT', $this->central, "writer/questions/{$id}", $this->writer, ['question_text' => 'sneaky'])->assertStatus(422)->assertJsonPath('error', 'qb_wrong_status');

        // rejected with a reason, which the writer sees
        $this->api('POST', $this->central, "writer/questions/{$id}/reject", $this->moderator, [])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->api('POST', $this->central, "writer/questions/{$id}/reject", $this->moderator, ['reason' => 'Give the SI unit'])->assertOk()->assertJsonPath('data.status', 'rejected');
        $this->api('GET', $this->central, "writer/questions/{$id}", $this->writer)->assertOk()
            ->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.review_note', 'Give the SI unit');

        // fixed and sent again; the moderator publishes
        $this->api('PUT', $this->central, "writer/questions/{$id}", $this->writer, ['answer_text' => 'metre per second'])->assertOk();
        $this->api('POST', $this->central, "writer/questions/{$id}/submit", $this->writer)->assertOk()->assertJsonPath('data.review_note', null);
        $this->api('POST', $this->central, "writer/questions/{$id}/publish", $this->moderator)->assertOk()->assertJsonPath('data.status', 'published');
        $q->refresh();
        $this->assertSame([$this->moderator->id, true], [$q->reviewed_by, $q->published_at !== null]);
        $this->api('PUT', $this->central, "writer/questions/{$id}", $this->writer, ['question_text' => 'changed after publishing'])->assertStatus(422);

        $actions = Tenancy::withoutTenancy(fn () => AuditLog::where('model', 'QbQuestion')->where('model_id', $id)->orderBy('id')->pluck('action')->all());
        $this->assertSame(['qb.question.submitted', 'qb.question.rejected', 'qb.question.submitted', 'qb.question.published'], $actions);
        $revs = $this->api('GET', $this->central, "writer/questions/{$id}/revisions", $this->writer)->assertOk()->json('data');
        $this->assertCount(3, $revs);                                                    // create, edit, edit after the rejection
        $this->assertSame(['metre per second', 'w1'], [$revs[0]['snapshot']['answer_text'], $revs[0]['edited_by']]);
    }

    public function test_a_writer_sees_and_edits_only_their_own_questions(): void
    {
        $other = $this->platformUser('content_writer', 'w2');
        $mine = $this->draft($this->writer, 'mine');
        $theirs = $this->draft($other, 'theirs');

        $this->assertSame([$mine], array_column($this->api('GET', $this->central, 'writer/questions', $this->writer)->assertOk()->json('data'), 'id'));
        $this->api('GET', $this->central, "writer/questions/{$theirs}", $this->writer)->assertNotFound();
        $this->api('PUT', $this->central, "writer/questions/{$theirs}", $this->writer, ['question_text' => 'x'])->assertNotFound();
        $this->api('POST', $this->central, "writer/questions/{$theirs}/submit", $this->writer)->assertNotFound();

        // the moderator sees everyone's, filtered by status; writes nothing
        $this->api('POST', $this->central, "writer/questions/{$mine}/submit", $this->writer)->assertOk();
        $review = $this->api('GET', $this->central, 'writer/questions?status=review', $this->moderator)->assertOk()->json('data');
        $this->assertSame([[$mine, 'w1']], array_map(fn ($r) => [$r['id'], $r['author']], $review));
        $this->assertCount(2, $this->api('GET', $this->central, 'writer/questions', $this->moderator)->json('data'));
        $this->api('POST', $this->central, 'writer/questions', $this->moderator, $this->place + ['question_text' => 'x'])->assertForbidden();
        $this->api('PUT', $this->central, "writer/questions/{$theirs}", $this->moderator, ['question_text' => 'x'])->assertForbidden();
    }

    public function test_the_place_in_the_curriculum_must_hang_together(): void
    {
        $otherSubject = QbSubject::create(['name_bn' => 'রসায়ন', 'name_en' => 'Chemistry']);
        $this->api('POST', $this->central, 'writer/questions', $this->writer, ['qb_subject_id' => $otherSubject->id] + $this->place + ['question_text' => 'x'])
            ->assertStatus(422);
        $this->api('POST', $this->central, 'writer/questions', $this->writer, array_merge($this->place, ['qb_subject_id' => $otherSubject->id, 'question_text' => 'x']))
            ->assertStatus(422)->assertJsonValidationErrors('qb_chapter_id');
        $this->api('POST', $this->central, 'writer/questions', $this->writer, $this->place + ['question_text' => 'x', 'status' => 'published'])
            ->assertStatus(422)->assertJsonValidationErrors('status');
        $this->assertSame(0, QbQuestion::count());
    }

    public function test_an_institution_sees_a_question_only_once_published(): void
    {
        $id = $this->draft($this->writer);
        $school = $this->makeInstitution('qbreview-school');
        $this->assertSame(0, Tenancy::as($school, fn () => QbQuestion::count()));
        $this->api('POST', $this->central, "writer/questions/{$id}/submit", $this->writer)->assertOk();
        $this->api('POST', $this->central, "writer/questions/{$id}/publish", $this->moderator)->assertOk();
        $this->assertSame(1, Tenancy::as($school, fn () => QbQuestion::count()));
    }

    public function test_writers_never_reach_an_institution_and_institution_users_never_reach_the_panel(): void
    {
        $school = $this->makeInstitution('qbreview-host');
        $admin = $this->makeUser($school, 'admin');
        $this->api('GET', $this->central, 'writer/questions', $admin)->assertForbidden();
        $this->api('GET', $this->hostOf($school), 'writer/questions', $this->writer)->assertNotFound();      // tenant:central
        $this->api('GET', $this->hostOf($school), 'programs', $this->writer)->assertForbidden();
        $this->api('GET', $this->central, 'super/qb/curriculum', $this->writer)->assertForbidden();
        $this->api('GET', $this->central, 'auth/me', $this->writer)->assertOk()->assertJsonPath('data.user.role', 'content_writer');
        $this->api('GET', $this->hostOf($school), 'auth/me', $this->writer)->assertForbidden();
    }

    public function test_the_role_check_alone_refuses_a_writer_inside_an_institution(): void
    {
        // defence in depth: tenant routes also run tenant.user first, so this checks RoleMiddleware by itself
        $school = $this->makeInstitution('qbreview-role');
        $res = Tenancy::as($school, function () {
            auth()->setUser($this->writer);
            return (new \App\Http\Middleware\RoleMiddleware)->handle(\Illuminate\Http\Request::create('/api/v1/x'), fn () => response('ok'), 'content_writer');
        });
        $this->assertSame([403, 'forbidden_host'], [$res->getStatusCode(), json_decode($res->getContent(), true)['error']]);
    }
}
