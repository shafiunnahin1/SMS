<?php

namespace Tests\Feature\Learner;

use App\Models\{LearnerProfile, QbChapter, QbClassLevel, QbConcept, QbPrice, QbQuestion, QbQuestionType, QbStudentOrder, QbStudentScopeAccess, QbSubject, QbTopic, QbWriterEarning, User};
use App\Services\Learner\LearnerRegistrationService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// D165 (2) ST.3: a student buys a whole class, one subject of their class or one chapter (student prices, bKash sandbox); the pack
// opens what it covers - including content added later - and nothing else, until its validity ends; a pack is bought once while
// valid; packs are priced for students only; another student never gets it.
class StudentPackTest extends TestCase
{
    use RefreshDatabase;

    private User $super;
    private QbClassLevel $c9;
    private QbSubject $math;
    private QbSubject $phys;
    private QbChapter $ch1;
    private QbChapter $ch2;
    private int $type;
    private ?array $execute = null;

    protected function setUp(): void
    {
        parent::setUp();
        $central = config('tenancy.central_domains')[0];
        config(['services.bkash' => ['base_url' => 'https://bkash.sandbox.test/v1', 'app_key' => 'k', 'app_secret' => 's', 'username' => 'u', 'password' => 'p', 'sandbox' => true],
            'app.url' => 'https://' . $central]);
        Http::fake([
            'bkash.sandbox.test/v1/tokenized/checkout/token/grant' => Http::response(['id_token' => 'tok']),
            'bkash.sandbox.test/v1/tokenized/checkout/create' => fn ($req) => Http::response(['paymentID' => 'PAY-' . $req['merchantInvoiceNumber'], 'bkashURL' => 'https://sandbox.bkash.test/pay']),
            'bkash.sandbox.test/v1/tokenized/checkout/execute' => fn ($req) => Http::response(['paymentID' => $req['paymentID'], 'trxID' => 'TRX1',
                'transactionStatus' => 'Completed', 'amount' => '150.00', 'merchantInvoiceNumber' => substr($req['paymentID'], 4)]),
        ]);
        $this->super = $this->makeUser(null, 'super_admin');
        $this->c9 = QbClassLevel::create(['name_bn' => '৯ম', 'name_en' => 'Class 9', 'education_level' => 'secondary', 'is_active' => true]);
        $this->math = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $this->phys = QbSubject::create(['name_bn' => 'পদার্থ', 'name_en' => 'Physics']);
        $this->c9->subjects()->attach([$this->math->id]);
        $this->ch1 = QbChapter::create(['qb_subject_id' => $this->math->id, 'name_bn' => 'অধ্যায় ১', 'name_en' => 'Ch 1']);
        $this->ch2 = QbChapter::create(['qb_subject_id' => $this->math->id, 'name_bn' => 'অধ্যায় ২', 'name_en' => 'Ch 2']);
        $this->type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        foreach (['class_pack' => '500.00', 'subject_pack' => '150.00', 'chapter_pack' => '40.00'] as $kind => $amount) {
            QbPrice::create(['audience' => 'student', 'item_kind' => $kind, 'amount' => $amount, 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        }
    }

    private function question(QbSubject $s, QbChapter $c, array $classes = []): QbQuestion
    {
        $q = QbQuestion::create(['qb_question_type_id' => $this->type, 'qb_subject_id' => $s->id, 'qb_chapter_id' => $c->id, 'question_text' => 'Q?', 'answer_text' => 'SECRET',
            'status' => 'published', 'created_by' => $this->super->id, 'published_at' => now()]);
        if ($classes) $q->classLevels()->attach($classes);
        return $q;
    }

    private function learner(): User
    {
        $i = LearnerRegistrationService::institution();
        $u = User::create(['institution_id' => $i->id, 'name' => 'L', 'phone' => '0171' . random_int(1000000, 9999999), 'role' => 'student', 'password' => 'Learner@2026', 'is_active' => true]);
        Tenancy::as($i, fn () => LearnerProfile::create(['user_id' => $u->id, 'qb_class_level_id' => $this->c9->id]));
        return $u;
    }

    private function open(User $u, QbQuestion $q): bool
    {
        return (bool) $this->api('GET', LearnerRegistrationService::host(), "student/qb/questions/{$q->id}", $u)->assertOk()->json('data.unlocked');
    }

    public function test_a_subject_pack_is_paid_with_bkash_and_opens_its_subject_only_including_later_questions(): void
    {
        $inSubject = $this->question($this->math, $this->ch1, [$this->c9->id]);
        $noClass = $this->question($this->math, $this->ch2);
        $other = $this->question($this->phys, QbChapter::create(['qb_subject_id' => $this->phys->id, 'name_bn' => 'প', 'name_en' => 'P']));
        $u = $this->learner();
        $host = LearnerRegistrationService::host();

        $offers = collect($this->api('GET', $host, 'student/qb/packs', $u, ['qb_subject_id' => $this->math->id, 'qb_chapter_id' => $this->ch1->id])->assertOk()->json('data'));
        $this->assertSame(['class_pack' => '500.00', 'subject_pack' => '150.00', 'chapter_pack' => '40.00'], $offers->pluck('price', 'item_type')->all());

        $r = $this->api('POST', $host, 'student/qb/orders', $u, ['items' => [['item_type' => 'subject_pack', 'item_id' => $this->math->id]]])->assertOk();
        $this->assertSame(['150.00', false], [$r->json('data.amount'), $r->json('data.paid')]);
        $this->assertFalse($this->open($u, $inSubject), 'not before the payment');
        $ref = $r->json('data.ref');
        $this->get('http://' . config('tenancy.central_domains')[0] . "/api/v1/qb/student-orders/bkash/callback?ref={$ref}&paymentID=PAY-{$ref}&status=success")->assertRedirect();
        $this->get('http://' . config('tenancy.central_domains')[0] . "/api/v1/qb/student-orders/bkash/callback?ref={$ref}&paymentID=PAY-{$ref}&status=success");   // repeated: still one
        $this->assertSame(1, Tenancy::as(LearnerRegistrationService::institution(), fn () => QbStudentScopeAccess::count()));

        $this->assertTrue($this->open($u, $inSubject));
        $this->assertTrue($this->open($u, $noClass), 'a question linked to no class counts for the subject');
        $this->assertFalse($this->open($u, $other));
        $this->assertTrue($this->open($u, $this->question($this->math, $this->ch2, [$this->c9->id])), 'added after the purchase');
        $this->assertNotNull(collect($this->api('GET', $host, 'student/qb/packs', $u, ['qb_subject_id' => $this->math->id])->json('data'))->firstWhere('item_type', 'subject_pack')['owned_until']);
        $this->api('POST', $host, 'student/qb/orders', $u, ['items' => [['item_type' => 'subject_pack', 'item_id' => $this->math->id]]])->assertOk()->assertJsonPath('data.paid', true)
            ->assertJsonPath('data.opened', 0);                                    // already valid: nothing to pay, nothing new
        $this->assertFalse($this->open($this->learner(), $inSubject), 'another student never gets it');
        $this->assertSame(0, QbWriterEarning::count(), 'pack shares wait for the owner (DECISIONS 2026-10-28)');
    }

    public function test_chapter_and_class_packs_cover_their_content_and_expire(): void
    {
        $a = $this->question($this->math, $this->ch1);
        $b = $this->question($this->math, $this->ch2);
        $topic = QbTopic::create(['qb_chapter_id' => $this->ch1->id, 'name_bn' => 'ট', 'name_en' => 'T']);
        $concept = QbConcept::create(['qb_topic_id' => $topic->id, 'title_bn' => 'ধারণা', 'title_en' => 'Idea', 'body_text' => 'BODY', 'status' => 'published', 'created_by' => $this->super->id]);
        QbPrice::where('item_kind', 'chapter_pack')->delete();
        QbPrice::create(['audience' => 'student', 'item_kind' => 'chapter_pack', 'amount' => '0.00', 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        $u = $this->learner();
        $host = LearnerRegistrationService::host();
        $this->api('POST', $host, 'student/qb/orders', $u, ['items' => [['item_type' => 'chapter_pack', 'item_id' => $this->ch1->id]]])->assertOk()->assertJsonPath('data.opened', 1);
        $this->assertSame([true, false], [$this->open($u, $a), $this->open($u, $b)]);
        $this->assertTrue($this->api('GET', $host, "student/qb/concepts/{$concept->id}", $u)->json('data.unlocked'));

        $v = $this->learner();
        QbPrice::where('item_kind', 'class_pack')->delete();
        QbPrice::create(['audience' => 'student', 'item_kind' => 'class_pack', 'amount' => '0.00', 'effective_from' => now()->subDay(), 'created_by' => $this->super->id]);
        $this->api('POST', $host, 'student/qb/orders', $v, ['items' => [['item_type' => 'class_pack', 'item_id' => $this->c9->id]]])->assertOk();
        $this->assertSame([true, true], [$this->open($v, $a), $this->open($v, $b)], 'maths is taught in class 9');
        Carbon::setTestNow(now()->addMonths(13));
        $this->assertFalse($this->open($v, $a), 'expired');
        Carbon::setTestNow();
        $this->assertSame(1, Tenancy::as(LearnerRegistrationService::institution(), fn () => QbStudentScopeAccess::where('student_user_id', $v->id)->count()), 'never deleted');
    }

    public function test_packs_are_student_only_and_unpriced_packs_are_not_for_sale(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $this->api('POST', $central, 'super/qb/prices', $this->super, ['audience' => 'institution', 'item_kind' => 'chapter_pack', 'amount' => '10'])->assertStatus(422)->assertJsonValidationErrors(['audience']);
        $this->api('POST', $central, 'super/qb/prices', $this->super, ['audience' => 'student', 'item_kind' => 'chapter_pack', 'amount' => '10'])->assertCreated();
        QbPrice::where('item_kind', 'class_pack')->delete();
        $this->api('POST', LearnerRegistrationService::host(), 'student/qb/orders', $this->learner(), ['items' => [['item_type' => 'class_pack', 'item_id' => $this->c9->id]]])
            ->assertStatus(422)->assertJsonPath('error', 'qb_not_for_sale');
        $this->assertSame(0, Tenancy::as(LearnerRegistrationService::institution(), fn () => QbStudentOrder::count()));
    }
}
