<?php

namespace Tests\Feature\Learner;

use App\Models\{LearnerProfile, QbChapter, QbClassLevel, QbMedia, QbPrice, QbQuestion, QbQuestionType, QbResource, QbSubject, User};
use App\Services\Learner\LearnerRegistrationService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D165 ST.4: a student's PDF / book opens (file) only once bought or in a valid pack; practice rounds draw only open MCQ questions,
// send them without answers, are marked once on the server and then show the answers; the summary is the student's own.
class StudentPracticeTest extends TestCase
{
    use RefreshDatabase;

    private User $super;
    private QbSubject $math;
    private QbChapter $ch1;
    private QbChapter $ch2;
    private int $type;

    protected function setUp(): void
    {
        parent::setUp();
        $this->super = $this->makeUser(null, 'super_admin');
        $this->math = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $this->ch1 = QbChapter::create(['qb_subject_id' => $this->math->id, 'name_bn' => '১', 'name_en' => 'Ch 1']);
        $this->ch2 = QbChapter::create(['qb_subject_id' => $this->math->id, 'name_bn' => '২', 'name_en' => 'Ch 2']);
        $this->type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        foreach (['chapter_pack' => '0.00', 'resource_pdf' => '20.00'] as $kind => $amount) {
            QbPrice::create(['audience' => 'student', 'item_kind' => $kind, 'amount' => $amount, 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        }
    }

    private function mcq(QbChapter $c, string $right = 'ক'): QbQuestion
    {
        $q = QbQuestion::create(['qb_question_type_id' => $this->type, 'qb_subject_id' => $this->math->id, 'qb_chapter_id' => $c->id, 'question_text' => '2+2?',
            'explanation_text' => 'EXPLAINED', 'status' => 'published', 'created_by' => $this->super->id, 'published_at' => now()]);
        foreach (['ক', 'খ'] as $i => $l) $q->options()->create(['label' => $l, 'content_text' => (string) ($i + 4), 'is_correct' => $l === $right, 'sort_order' => $i]);
        return $q;
    }

    private function learner(): User
    {
        $i = LearnerRegistrationService::institution();
        $u = User::create(['institution_id' => $i->id, 'name' => 'L', 'phone' => '0171' . random_int(1000000, 9999999), 'role' => 'student', 'password' => 'Learner@2026', 'is_active' => true]);
        $class = QbClassLevel::firstOrCreate(['name_en' => 'C9'], ['name_bn' => '৯', 'education_level' => 'secondary', 'is_active' => true])->id;
        Tenancy::as($i, fn () => LearnerProfile::create(['user_id' => $u->id, 'qb_class_level_id' => $class]));
        return $u;
    }

    public function test_a_pdf_opens_only_once_bought_or_in_a_pack(): void
    {
        $file = QbMedia::create(['path' => 'platform/qb/book.pdf', 'mime' => 'application/pdf', 'size_bytes' => 10, 'uploaded_by' => $this->super->id]);
        $pdf = QbResource::create(['kind' => 'pdf', 'title_bn' => 'নোট', 'qb_subject_id' => $this->math->id, 'qb_chapter_id' => $this->ch1->id, 'qb_media_id' => $file->id,
            'status' => 'published', 'created_by' => $this->super->id]);
        $host = LearnerRegistrationService::host();
        $u = $this->learner();
        $r = $this->api('GET', $host, "student/qb/resources/{$pdf->id}", $u)->assertOk();
        $this->assertSame([false, '20.00'], [$r->json('data.unlocked'), $r->json('data.price')]);
        $this->assertArrayNotHasKey('file', $r->json('data'));
        $this->assertSame([$pdf->id], collect($this->api('GET', $host, 'student/qb/resources', $u, ['qb_chapter_id' => $this->ch1->id])->json('data'))->pluck('id')->all());

        $this->api('POST', $host, 'student/qb/orders', $u, ['items' => [['item_type' => 'chapter_pack', 'item_id' => $this->ch1->id]]])->assertOk()->assertJsonPath('data.opened', 1);
        $r = $this->api('GET', $host, "student/qb/resources/{$pdf->id}", $u)->assertOk();
        $this->assertTrue($r->json('data.unlocked'));
        $this->assertStringContainsString('book.pdf', $r->json('data.file.url'));
        $this->assertArrayNotHasKey('file', $this->api('GET', $host, "student/qb/resources/{$pdf->id}", $this->learner())->json('data'), 'another student');
    }

    public function test_practice_draws_open_questions_marks_once_and_sums_up(): void
    {
        $a = $this->mcq($this->ch1, 'ক');
        $b = $this->mcq($this->ch1, 'খ');
        $closed = $this->mcq($this->ch2);
        $host = LearnerRegistrationService::host();
        $u = $this->learner();
        $this->api('POST', $host, 'student/qb/practice', $u, ['qb_subject_id' => $this->math->id])->assertStatus(422)->assertJsonPath('error', 'practice_nothing_open');

        $this->api('POST', $host, 'student/qb/orders', $u, ['items' => [['item_type' => 'chapter_pack', 'item_id' => $this->ch1->id]]])->assertOk();
        $start = $this->api('POST', $host, 'student/qb/practice', $u, ['qb_subject_id' => $this->math->id, 'count' => 10])->assertCreated();
        $ids = collect($start->json('data.questions'))->pluck('id')->sort()->values()->all();
        $this->assertSame([$a->id, $b->id], $ids, 'only the open ones');
        foreach (['is_correct', 'EXPLAINED', 'explanation_text'] as $hidden) $this->assertStringNotContainsString($hidden, $start->getContent(), "{$hidden} before submitting");

        $id = $start->json('data.id');
        $this->api('POST', $host, "student/qb/practice/{$id}/submit", $this->learner(), ['answers' => []])->assertNotFound();   // another student's round
        $done = $this->api('POST', $host, "student/qb/practice/{$id}/submit", $u, ['answers' => [$a->id => 'ক', $b->id => 'ক']])->assertOk();
        $this->assertSame([2, 1], [$done->json('data.total'), $done->json('data.correct')]);
        $this->assertStringContainsString('EXPLAINED', $done->getContent(), 'shown after marking');
        $this->api('POST', $host, "student/qb/practice/{$id}/submit", $u, ['answers' => [$a->id => 'ক', $b->id => 'খ']])->assertStatus(422);   // once

        $stats = $this->api('GET', $host, 'student/qb/practice', $u)->assertOk()->json('data.summary.0');
        $this->assertSame([1, 2, 1, 50], [$stats['rounds'], $stats['total'], $stats['correct'], (int) $stats['percent']]);
        $this->assertSame([], $this->api('GET', $host, 'student/qb/practice', $this->learner())->json('data.summary'));
        $this->assertNotContains($closed->id, $ids);
    }
}
