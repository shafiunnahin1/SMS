<?php

namespace Tests\Feature\Learner;

use App\Models\{Program, QbChapter, QbClassLevel, QbExamBatch, QbPrice, QbQuestion, QbQuestionType, QbStudentScopeAccess, QbStudentUnlock, QbSubject, QbWriterEarning, Student, User};
use App\Services\Auth\OtpService;
use App\Services\Learner\{LearnerRegistrationService, StudentMoveService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D165 ST.5: an institution's student uses the same practice and purchases in their own login, with the class of their program and
// an SSC/HSC batch of their choice; on leaving they move their valid purchases to their own learners account (own mobile code):
// copied with the same expiry at price 0, the institution's rows untouched, no writer share again; not on the learners host.
class StudentMoveTest extends TestCase
{
    use RefreshDatabase;

    private function setUpSchool(): array
    {
        $super = $this->makeUser(null, 'super_admin');
        $c9 = QbClassLevel::create(['name_bn' => '৯', 'name_en' => 'C9', 'education_level' => 'secondary', 'is_active' => true]);
        $math = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $ch = QbChapter::create(['qb_subject_id' => $math->id, 'name_bn' => '১', 'name_en' => 'Ch 1']);
        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'স', 'name_en' => 'S', 'family' => 'short'])->id;
        $q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => $math->id, 'qb_chapter_id' => $ch->id, 'question_text' => 'Q?', 'answer_text' => 'SECRET',
            'status' => 'published', 'created_by' => $super->id, 'published_at' => now()]);
        QbPrice::create(['audience' => 'student', 'item_kind' => 'chapter_pack', 'amount' => '0.00', 'effective_from' => now()->subDay(), 'created_by' => $super->id]);
        QbPrice::create(['audience' => 'student', 'item_kind' => 'question_answer', 'qb_question_type_id' => $type, 'amount' => '0.00', 'effective_from' => now()->subDay(), 'created_by' => $super->id]);
        $ssc = QbExamBatch::create(['name' => 'SSC 2027', 'kind' => 'ssc', 'class_level_ids' => [$c9->id], 'exam_ends_on' => now()->addYear()->toDateString(), 'is_active' => true]);
        $school = $this->makeInstitution('mvschool', 'school');
        $student = User::create(['institution_id' => $school->id, 'name' => 'Rafi', 'username' => 'S1', 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
        Tenancy::as($school, function () use ($student, $c9) {
            $p = Program::create(['name' => 'Class 9']);
            $p->forceFill(['qb_class_level_id' => $c9->id])->save();
            (new Student)->forceFill(['institution_id' => Tenancy::current()->id, 'user_id' => $student->id, 'program_id' => $p->id, 'student_id' => 'S1', 'guardian_phone' => '01700000000'])->save();
        });
        return compact('school', 'student', 'q', 'ch', 'ssc', 'c9');
    }

    private function code(int $learnerId, string $purpose): string
    {
        return Tenancy::as(LearnerRegistrationService::institution(), function () use ($learnerId, $purpose) {
            [, $code] = app(OtpService::class)->issue(User::inTenant()->findOrFail($learnerId), $purpose);
            return $code;
        });
    }

    public function test_institution_student_picks_a_batch_buys_and_moves_purchases_to_a_new_own_account(): void
    {
        ['school' => $school, 'student' => $s, 'q' => $q, 'ch' => $ch, 'ssc' => $ssc, 'c9' => $c9] = $this->setUpSchool();
        $host = $this->hostOf($school);
        $p = $this->api('GET', $host, 'learner/profile', $s)->assertOk();
        $this->assertSame([$c9->id, false, ['SSC 2027']], [$p->json('data.qb_class_level_id'), $p->json('data.class_editable'), collect($p->json('data.batches'))->pluck('name')->all()]);
        $this->api('PUT', $host, 'learner/profile', $s, ['qb_class_level_id' => 999, 'qb_exam_batch_id' => $ssc->id])->assertStatus(422);   // no such class
        $this->api('PUT', $host, 'learner/profile', $s, ['qb_exam_batch_id' => $ssc->id])->assertOk()->assertJsonPath('data.exam_batch.name', 'SSC 2027');
        $this->assertSame('exam_batch', $this->api('GET', $host, 'student/qb/validity', $s)->json('data.rule'));

        $this->api('POST', $host, 'student/qb/orders', $s, ['items' => [['item_type' => 'chapter_pack', 'item_id' => $ch->id]]])->assertOk();
        $this->api('POST', $host, 'student/qb/practice', $s, ['qb_subject_id' => $ch->qb_subject_id])->assertStatus(422);   // short answers: no MCQ to practise
        $this->assertTrue($this->api('GET', $host, "student/qb/questions/{$q->id}", $s)->json('data.unlocked'));
        $earnings = QbWriterEarning::count();

        $this->api('POST', $host, 'learner/move', $s, ['phone' => '01811111111', 'accept_terms' => true])->assertStatus(422)->assertJsonPath('error', 'learner_move_password');
        $this->api('POST', $host, 'learner/move', $s, ['phone' => '01811111111', 'password' => 'Own-pass-2026', 'password_confirmation' => 'Own-pass-2026', 'accept_terms' => true])
            ->assertOk()->assertJsonPath('data.phone', '018******11');
        $learner = Tenancy::as(LearnerRegistrationService::institution(), fn () => User::inTenant()->where('phone', '01811111111')->sole());
        $this->api('POST', $host, 'learner/move/verify', $s, ['code' => '000000x'])->assertStatus(422);
        $done = $this->api('POST', $host, 'learner/move/verify', $s, ['code' => $this->code($learner->id, LearnerRegistrationService::OTP)])->assertOk();
        $this->assertSame([1, LearnerRegistrationService::host()], [$done->json('data.moved'), $done->json('data.login_host')]);

        $copy = Tenancy::as(LearnerRegistrationService::institution(), fn () => QbStudentScopeAccess::where('student_user_id', $learner->id)->sole());
        $orig = Tenancy::as($school, fn () => QbStudentScopeAccess::where('student_user_id', $s->id)->sole());
        $this->assertSame(['0.00', $orig->expires_at->toDateTimeString(), $ssc->id], [(string) $copy->price, $copy->expires_at->toDateTimeString(), $copy->qb_exam_batch_id]);
        $this->assertSame($earnings, QbWriterEarning::count(), 'no writer share again');
        $this->assertTrue((bool) $learner->fresh()->is_active);
        $this->assertTrue($this->api('GET', LearnerRegistrationService::host(), "student/qb/questions/{$q->id}", $learner->fresh())->json('data.unlocked'), 'open in the own account');
        $this->api('POST', $host, 'learner/move/verify', $s, ['code' => '123456'])->assertNotFound();   // nothing pending any more
    }

    public function test_an_existing_own_account_is_confirmed_by_its_mobile_and_learners_cannot_move(): void
    {
        ['school' => $school, 'student' => $s, 'q' => $q] = $this->setUpSchool();
        $host = $this->hostOf($school);
        $this->api('POST', $host, 'student/qb/orders', $s, ['items' => [['item_type' => 'question', 'item_id' => $q->id]]])->assertOk();
        $own = User::create(['institution_id' => LearnerRegistrationService::institution()->id, 'name' => 'Own', 'phone' => '01922222222', 'role' => 'student', 'password' => 'Own-pass-2026', 'is_active' => true]);
        $this->api('POST', $host, 'learner/move', $s, ['phone' => '01922222222', 'accept_terms' => true])->assertOk();
        $this->api('POST', $host, 'learner/move/verify', $s, ['code' => $this->code($own->id, StudentMoveService::OTP)])->assertOk()->assertJsonPath('data.moved', 1);
        $this->assertSame(1, Tenancy::as(LearnerRegistrationService::institution(), fn () => QbStudentUnlock::where('student_user_id', $own->id)->count()));
        $this->assertSame(1, Tenancy::as($school, fn () => QbStudentUnlock::where('student_user_id', $s->id)->count()), 'the institution\'s row stays');

    }

    public function test_a_self_registered_student_has_nothing_to_move(): void
    {
        $own = User::create(['institution_id' => LearnerRegistrationService::institution()->id, 'name' => 'Own', 'phone' => '01933333333', 'role' => 'student', 'password' => 'Own-pass-2026', 'is_active' => true]);
        $this->api('POST', LearnerRegistrationService::host(), 'learner/move', $own, ['phone' => '01933333333', 'accept_terms' => true])->assertNotFound();
    }
}
