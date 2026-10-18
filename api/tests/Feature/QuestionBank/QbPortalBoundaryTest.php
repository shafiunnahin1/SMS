<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbChapter, QbQuestionType, QbSubject, QbTopic, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// R2.1.1 / D111 (4): the two central-host portals stay separate - a writer cannot publish or reject; a moderator cannot author,
// see earnings or withdraw; a school user cannot enter either portal.
class QbPortalBoundaryTest extends TestCase
{
    use RefreshDatabase;

    private function platformUser(string $role, string $tag): User
    {
        return User::create(['institution_id' => null, 'name' => $tag, 'role' => $role, 'phone' => '0171' . str_pad((string) (crc32($tag) % 10000000), 7, '0', STR_PAD_LEFT),
            'password' => 'Writer-pass-26', 'is_active' => true]);
    }

    public function test_writer_and_moderator_powers_do_not_overlap(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $writer = $this->platformUser('content_writer', 'pw'); $moderator = $this->platformUser('content_moderator', 'pm');
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Math']);
        $topic = QbTopic::create(['qb_chapter_id' => QbChapter::create(['qb_subject_id' => $subject->id, 'name_bn' => 'অধ্যায়', 'name_en' => 'Ch'])->id, 'name_bn' => 'বিষয়', 'name_en' => 'T']);
        $place = ['qb_question_type_id' => QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id,
            'qb_subject_id' => $subject->id, 'qb_topic_id' => $topic->id];
        $id = $this->api('POST', $central, 'writer/questions', $writer, $place + ['question_text' => 'Q?', 'answer_text' => 'A'])->assertCreated()->json('data.id');
        $this->api('POST', $central, "writer/questions/$id/submit", $writer)->assertOk();
        $this->api('POST', $central, "writer/questions/$id/publish", $writer)->assertForbidden();
        $this->api('POST', $central, "writer/questions/$id/reject", $writer, ['reason' => 'x'])->assertForbidden();

        $this->api('POST', $central, 'writer/questions', $moderator, $place + ['question_text' => 'Mine?', 'answer_text' => 'A'])->assertForbidden();
        $this->api('GET', $central, 'writer/earnings', $moderator)->assertForbidden();
        $this->api('GET', $central, 'writer/withdrawals', $moderator)->assertForbidden();
        $this->api('POST', $central, 'writer/withdrawals', $moderator, ['amount' => '10.00'])->assertForbidden();
        $this->api('POST', $central, "writer/questions/$id/publish", $moderator)->assertOk();

        // D110: qbank's dashboard counters, plus the caller's own work (a writer) or everyone's (a moderator)
        $this->api('POST', $central, 'writer/questions', $writer, $place + ['question_text' => 'Draft?', 'answer_text' => 'A'])->assertCreated();
        $d = $this->api('GET', $central, 'writer/dashboard', $writer)->assertOk()->json('data');
        $this->assertSame([1, 1, 1, 1], [$d['questions'], $d['subjects'], $d['chapters'], $d['topics']]);
        $this->assertSame(['draft' => 1, 'review' => 0, 'rejected' => 0, 'published' => 1], $d['by_status']);
        $this->assertSame(1, $this->api('GET', $central, 'writer/dashboard', $moderator)->assertOk()->json('data.by_status.draft'));

        $school = $this->makeInstitution('portal-school');
        foreach (['admin', 'teacher'] as $role) {
            $u = $this->makeUser($school, $role);
            $this->assertContains($this->api('GET', $central, 'writer/questions', $u)->status(), [403, 404], "$role on the central host");
            $this->api('GET', $this->hostOf($school), 'writer/questions', $u)->assertNotFound();
        }
    }
}
