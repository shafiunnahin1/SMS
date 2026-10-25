<?php

namespace Tests\Feature\Learner;

use App\Models\{Institution, LearnerProfile, QbClassLevel, QbExamBatch, QbPriceRule, QbQuestion, QbQuestionType, QbStudentUnlock, QbSubject, User};
use App\Services\Learner\{LearnerRegistrationService, StudentValidityService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

// D165 (3) ST.2: validity is fixed at purchase - class 1-8 until 31 December (Asia/Dhaka), a batch class with its batch until the
// exam end day, anything else 12 months; it is shown before payment; an expired item locks and can be bought again; moving a
// batch's exam date moves every purchase made under it; a learner picks only a batch that covers their class and is not over.
class StudentValidityTest extends TestCase
{
    use RefreshDatabase;

    private QbClassLevel $c8;
    private QbClassLevel $c9;
    private QbExamBatch $ssc;
    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-03-10 10:00:00', 'UTC'));
        $this->c8 = QbClassLevel::create(['name_bn' => '৮ম', 'name_en' => 'Class 8', 'education_level' => 'secondary', 'is_active' => true]);
        $this->c9 = QbClassLevel::create(['name_bn' => '৯ম', 'name_en' => 'Class 9', 'education_level' => 'secondary', 'is_active' => true]);
        $this->super = $this->makeUser(null, 'super_admin');
        $this->ssc = QbExamBatch::create(['name' => 'SSC 2027', 'kind' => 'ssc', 'class_level_ids' => [$this->c9->id], 'exam_ends_on' => '2027-05-20', 'is_active' => true]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function learner(?int $class, ?int $batch = null): array
    {
        $i = LearnerRegistrationService::institution();
        $u = User::create(['institution_id' => $i->id, 'name' => 'L', 'phone' => '0171' . random_int(1000000, 9999999), 'role' => 'student', 'password' => 'Learner@2026', 'is_active' => true]);
        Tenancy::as($i, fn () => LearnerProfile::create(['user_id' => $u->id, 'qb_class_level_id' => $class, 'qb_exam_batch_id' => $batch]));
        return [$i, $u];
    }

    private function rule(User $u, Institution $i): array
    {
        return Tenancy::as($i, fn () => app(StudentValidityService::class)->forUser($u));
    }

    public function test_the_three_rules(): void
    {
        [$i, $u] = $this->learner($this->c8->id);
        $v = $this->rule($u, $i);
        $this->assertSame(['year_end', '2026-12-31 23:59:59'], [$v['rule'], $v['expires_at']->copy()->setTimezone('Asia/Dhaka')->format('Y-m-d H:i:s')]);

        [$i, $u] = $this->learner($this->c9->id, $this->ssc->id);
        $v = $this->rule($u, $i);
        $this->assertSame(['exam_batch', '2027-05-20 23:59:59', $this->ssc->id], [$v['rule'], $v['expires_at']->copy()->setTimezone('Asia/Dhaka')->format('Y-m-d H:i:s'), $v['qb_exam_batch_id']]);

        [$i, $u] = $this->learner($this->c9->id);                       // a batch class without a batch
        $this->assertSame(['twelve_months', '2027-03-10'], [$this->rule($u, $i)['rule'], $this->rule($u, $i)['expires_at']->toDateString()]);
        [$i, $u] = $this->learner(null);
        $this->assertSame('twelve_months', $this->rule($u, $i)['rule']);

        $this->api('GET', LearnerRegistrationService::host(), 'student/qb/validity', $u)->assertOk()->assertJsonPath('data.rule', 'twelve_months')->assertJsonPath('data.days_left', 365);
    }

    public function test_expiry_locks_rebuy_works_and_a_moved_exam_date_moves_purchases(): void
    {
        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        $q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id,
            'question_text' => '2+2?', 'answer_text' => 'SECRET', 'status' => 'published', 'created_by' => $this->super->id, 'published_at' => now()]);
        QbPriceRule::create(['target_type' => 'item', 'target_ref' => "question:{$q->id}", 'method' => 'free', 'audience' => 'student', 'created_by' => $this->super->id]);
        [$i, $u] = $this->learner($this->c9->id, $this->ssc->id);
        $host = LearnerRegistrationService::host();
        $buy = fn () => $this->api('POST', $host, 'student/qb/orders', $u, ['items' => [['item_type' => 'question', 'item_id' => $q->id]]])->assertOk();
        $buy();
        $row = Tenancy::as($i, fn () => QbStudentUnlock::sole());
        $this->assertSame([$this->ssc->id, '2027-05-20 17:59:59'], [$row->qb_exam_batch_id, $row->expires_at->format('Y-m-d H:i:s')]);   // 23:59:59 Dhaka = 17:59:59 UTC
        $this->assertTrue($this->api('GET', $host, "student/qb/questions/{$q->id}", $u)->json('data.unlocked'));

        // the board postpones the exam: every purchase under the batch moves with it
        $this->api('PUT', 'admin.' . config('tenancy.base_domain'), "super/qb/exam-batches/{$this->ssc->id}", $this->super,
            ['name' => 'SSC 2027', 'kind' => 'ssc', 'class_level_ids' => [$this->c9->id], 'exam_ends_on' => '2027-06-30'])->assertOk()->assertJsonPath('data.purchases_moved', 1);
        $this->assertSame('2027-06-30 17:59:59', Tenancy::as($i, fn () => QbStudentUnlock::sole()->expires_at->format('Y-m-d H:i:s')));

        Carbon::setTestNow(Carbon::parse('2027-07-01 00:00:00', 'UTC'));        // after the exam: locked, and it can be bought again
        $this->assertFalse($this->api('GET', $host, "student/qb/questions/{$q->id}", $u)->json('data.unlocked'));
        $buy();
        $this->assertSame(2, Tenancy::as($i, fn () => QbStudentUnlock::count()), 'a new row; the old one stays (D32)');
        $this->assertTrue($this->api('GET', $host, "student/qb/questions/{$q->id}", $u)->json('data.unlocked'));
        $buy();
        $this->assertSame(2, Tenancy::as($i, fn () => QbStudentUnlock::count()), 'not twice while valid');
    }

    public function test_super_admin_batches_and_the_learner_picks_a_covering_batch(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $hsc = $this->api('POST', $central, 'super/qb/exam-batches', $this->super, ['name' => 'HSC 2026', 'kind' => 'hsc', 'class_level_ids' => [$this->c9->id], 'exam_ends_on' => '2026-08-31'])
            ->assertCreated()->json('data.id');
        $this->api('POST', $central, 'super/qb/exam-batches', $this->super, ['name' => 'X', 'kind' => 'jsc', 'class_level_ids' => [], 'exam_ends_on' => '31-08-2026'])
            ->assertStatus(422)->assertJsonValidationErrors(['kind', 'class_level_ids', 'exam_ends_on']);
        $this->assertCount(2, $this->api('GET', $central, 'super/qb/exam-batches', $this->super)->assertOk()->json('data'));
        $this->api('GET', $central, 'super/qb/exam-batches', $this->makeUser(null, 'content_writer'))->assertForbidden();

        [, $u] = $this->learner($this->c9->id);
        $host = LearnerRegistrationService::host();
        $this->assertSame(['SSC 2027', 'HSC 2026'], collect($this->api('GET', $host, 'learner/profile', $u)->assertOk()->json('data.batches'))->pluck('name')->sort()->reverse()->values()->all());
        $this->api('PUT', $host, 'learner/profile', $u, ['qb_class_level_id' => $this->c9->id, 'qb_exam_batch_id' => $hsc])->assertOk()->assertJsonPath('data.exam_batch.name', 'HSC 2026');
        $this->api('PUT', $host, 'learner/profile', $u, ['qb_class_level_id' => $this->c8->id, 'qb_exam_batch_id' => $this->ssc->id])->assertStatus(422)->assertJsonPath('error', 'learner_batch_invalid');
        Carbon::setTestNow(Carbon::parse('2026-09-01', 'UTC'));
        $this->api('PUT', $host, 'learner/profile', $u, ['qb_class_level_id' => $this->c9->id, 'qb_exam_batch_id' => $hsc])->assertStatus(422);   // already over
    }
}
