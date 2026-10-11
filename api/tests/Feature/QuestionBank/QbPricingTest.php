<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbChapter, QbClassLevel, QbConcept, QbPrice, QbPriceRule, QbQuestion, QbQuestionType, QbResource, QbSubject, QbTopic, QbMedia, User};
use App\Services\QbPricingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// QB.6 (D66, docs/modules/question-bank.md §4.1-§4.3): every method of the rule engine and the precedence order, to the paisa,
// half up, never below 0; the price rows (a change is a new row) and the Super Admin's rule API (switch off, never delete;
// a preview saves nothing).
class QbPricingTest extends TestCase
{
    use RefreshDatabase;

    private QbPricingService $svc;
    private User $super;
    private int $mcq;
    private int $creative;
    private QbSubject $subject;
    private QbChapter $chapter;
    private QbTopic $topic;
    private QbClassLevel $nine;

    protected function setUp(): void
    {
        parent::setUp();
        $this->svc = app(QbPricingService::class);
        $this->super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $this->mcq = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq'])->id;
        $this->creative = QbQuestionType::create(['slug' => 'creative', 'name_bn' => 'সৃজনশীল', 'name_en' => 'Creative', 'family' => 'creative'])->id;
        $this->subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $this->chapter = QbChapter::create(['qb_subject_id' => $this->subject->id, 'name_bn' => 'বীজগণিত', 'name_en' => 'Algebra']);
        $this->topic = QbTopic::create(['qb_chapter_id' => $this->chapter->id, 'name_bn' => 'সূচক', 'name_en' => 'Indices']);
        $this->nine = QbClassLevel::create(['name_bn' => '৯ম', 'name_en' => 'Class 9']);
        $this->price('institution', 'question_answer', '0.50', $this->mcq);
        $this->price('institution', 'question_answer', '2.00', $this->creative);
        $this->price('student', 'question_answer', '1.00', $this->mcq);
        $this->price('institution', 'concept', '5.00');
        $this->price('institution', 'resource_pdf', '20.00');
    }

    private function price(string $aud, string $kind, string $amount, ?int $type = null, $from = null): QbPrice
    {
        return QbPrice::create(['audience' => $aud, 'item_kind' => $kind, 'qb_question_type_id' => $type, 'amount' => $amount, 'effective_from' => $from ?? now()->subDay(), 'created_by' => $this->super->id]);
    }

    private function question(int $type = 0, ?int $topic = null): QbQuestion
    {
        return QbQuestion::create(['qb_question_type_id' => $type ?: $this->mcq, 'qb_subject_id' => $this->subject->id, 'qb_chapter_id' => $this->chapter->id,
            'qb_topic_id' => $topic ?? $this->topic->id, 'question_text' => 'q', 'status' => 'published', 'created_by' => $this->super->id]);
    }

    private function rule(string $method, string $type = 'all', ?string $ref = null, ?string $value = null, array $extra = []): QbPriceRule
    {
        return QbPriceRule::create($extra + ['target_type' => $type, 'target_ref' => $ref, 'method' => $method, 'value' => $value, 'audience' => 'both', 'created_by' => $this->super->id]);
    }

    private function quote(QbQuestion|QbConcept|QbResource $item, string $aud = 'institution', array $buyer = []): array
    {
        $type = match (true) { $item instanceof QbQuestion => 'question', $item instanceof QbConcept => 'concept', default => 'resource' };
        return $this->svc->quote($aud, $type, $item, $buyer);
    }

    public function test_base_prices_per_type_audience_and_kind_and_a_change_is_a_new_row(): void
    {
        $q = $this->question();
        $this->assertSame(['0.50', '0.50', null], [$this->quote($q)['base'], $this->quote($q)['price'], $this->quote($q)['rule_id']]);
        $this->assertSame('2.00', $this->quote($this->question($this->creative))['price']);
        $this->assertSame('1.00', $this->quote($q, 'student')['price'], 'students have their own price');
        $this->price('institution', 'question_answer', '0.75', $this->mcq, now()->addDay());            // not yet in force
        $this->assertSame('0.50', $this->quote($q)['price']);
        $this->price('institution', 'question_answer', '0.60', $this->mcq, now()->subHour());           // newer row in force
        $this->assertSame('0.60', $this->quote($q)['price']);
        $c = QbConcept::create(['qb_topic_id' => $this->topic->id, 'title_bn' => 'c', 'body_text' => 'b', 'status' => 'published', 'created_by' => $this->super->id]);
        $this->assertSame('5.00', $this->quote($c)['price']);
        $this->assertSame([null, null], [$this->quote($c, 'student')['base'], $this->quote($c, 'student')['price']], 'no price row = not for sale');
    }

    public function test_each_discount_method_to_the_paisa(): void
    {
        $q = $this->question($this->creative);                       // base 2.00
        $r = $this->rule('percent_off', 'question_type', (string) $this->creative, '33.33');
        $this->assertSame(['1.33', $r->id, 'percent_off'], [$this->quote($q)['price'], $this->quote($q)['rule_id'], $this->quote($q)['method']]);   // 2.00 x 66.67% = 1.3334
        $r->update(['is_active' => false]);
        $r = $this->rule('percent_off', 'question_type', (string) $this->creative, '12.25');
        $this->assertSame('1.76', $this->quote($q)['price']);         // 2.00 x 87.75% = 1.755 -> half up
        $r->update(['is_active' => false]);
        $r = $this->rule('amount_off', 'item', "question:{$q->id}", '0.75');
        $this->assertSame('1.25', $this->quote($q)['price']);
        $r->update(['is_active' => false]);
        $r = $this->rule('amount_off', 'item', "question:{$q->id}", '9.99');
        $this->assertSame('0.00', $this->quote($q)['price'], 'never below 0');
        $r->update(['is_active' => false]);
        $this->rule('fixed_price', 'topic', (string) $this->topic->id, '1.10');
        $this->assertSame('1.10', $this->quote($q)['price']);
        $this->rule('percent_off', 'topic', (string) $this->topic->id, '100');
        $this->assertSame('1.10', $this->quote($q)['price'], 'same target and priority: fixed_price beats percent_off');
    }

    public function test_free_methods(): void
    {
        $first = $this->question();
        $second = $this->question();
        $third = $this->question();
        $r = $this->rule('first_n_items_free', 'topic', (string) $this->topic->id, '2');
        $this->assertSame(['0.00', '0.00', '0.50'], [$this->quote($first)['price'], $this->quote($second)['price'], $this->quote($third)['price']]);
        $r->update(['is_active' => false]);

        $r = $this->rule('free_first_n_per_buyer', 'all', null, '3');
        $this->assertSame('0.50', $this->quote($first)['price'], 'without the buyer\'s count a per-buyer rule never applies');
        $this->assertSame('0.00', $this->quote($first, buyer: ['uses' => fn ($id) => 2])['price']);
        $this->assertSame('0.50', $this->quote($first, buyer: ['uses' => fn ($id) => 3])['price']);
        $r->update(['is_active' => false]);

        $this->rule('free_for_class_level', 'class_level', (string) $this->nine->id);
        $this->assertSame('0.50', $this->quote($first, buyer: ['class_level_ids' => []])['price']);
        $this->assertSame(['0.00', 'free_for_class_level'], [$this->quote($first, buyer: ['class_level_ids' => [$this->nine->id]])['price'],
            $this->quote($first, buyer: ['class_level_ids' => [$this->nine->id]])['method']]);

        $this->rule('free', 'subject', (string) $this->subject->id);
        $this->assertSame(['0.00', 'free'], [$this->quote($third)['price'], $this->quote($third)['method']]);
    }

    public function test_precedence_free_first_then_specific_then_priority_then_newest(): void
    {
        $q = $this->question($this->creative);
        $this->rule('fixed_price', 'item', "question:{$q->id}", '1.90');
        $free = $this->rule('free', 'all');
        $this->assertSame([$free->id, '0.00'], [$this->quote($q)['rule_id'], $this->quote($q)['price']], 'a free method beats any price rule, however specific');
        $free->update(['is_active' => false]);

        $this->assertSame('1.90', $this->quote($q)['price'], 'item beats everything below it');
        QbPriceRule::where('target_type', 'item')->update(['is_active' => false]);
        $chapter = $this->rule('fixed_price', 'chapter', (string) $this->chapter->id, '1.50');
        $this->rule('fixed_price', 'subject', (string) $this->subject->id, '1.00', ['priority' => 99]);
        $this->assertSame([$chapter->id, '1.50'], [$this->quote($q)['rule_id'], $this->quote($q)['price']], 'the more specific target wins over a higher priority');
        $high = $this->rule('fixed_price', 'chapter', (string) $this->chapter->id, '1.40', ['priority' => 5]);
        $this->assertSame($high->id, $this->quote($q)['rule_id'], 'same target level: higher priority');
        $newer = $this->rule('fixed_price', 'chapter', (string) $this->chapter->id, '1.30', ['priority' => 5]);
        $this->assertSame($newer->id, $this->quote($q)['rule_id'], 'same level and priority: the newest');
    }

    public function test_time_window_audience_and_pages(): void
    {
        $q = $this->question();
        $this->rule('free', 'all', null, null, ['starts_at' => now()->addDay()]);
        $this->rule('free', 'all', null, null, ['ends_at' => now()->subMinute()]);
        $this->rule('free', 'all', null, null, ['audience' => 'student']);
        $this->assertSame('0.50', $this->quote($q)['price'], 'future, ended and other-audience rules do not apply');
        $this->assertSame('0.00', $this->quote($q, 'student')['price']);

        $pdf = QbMedia::create(['path' => 'p.pdf', 'mime' => 'application/pdf', 'size_bytes' => 1, 'uploaded_by' => $this->super->id]);
        $book = QbResource::create(['kind' => 'pdf', 'title_bn' => 'b', 'qb_topic_id' => $this->topic->id, 'qb_media_id' => $pdf->id, 'page_count' => 40, 'status' => 'published', 'created_by' => $this->super->id]);
        $this->rule('first_n_pages_free', 'resource_kind', 'pdf', '5');
        $this->rule('amount_off', 'chapter', (string) $this->chapter->id, '2.50');             // a topic-filed PDF still counts as in its chapter
        $this->assertSame(['20.00', '17.50', 5], [$this->quote($book)['base'], $this->quote($book)['price'], $this->quote($book)['free_pages']]);
    }

    public function test_the_super_admins_api(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $this->api('POST', $central, 'super/qb/prices', $this->super, ['audience' => 'institution', 'item_kind' => 'question_answer', 'amount' => '0.55'])
            ->assertStatus(422)->assertJsonValidationErrors('qb_question_type_id');
        $this->api('POST', $central, 'super/qb/prices', $this->super, ['audience' => 'institution', 'item_kind' => 'concept', 'amount' => '0.555'])->assertStatus(422);
        $this->api('POST', $central, 'super/qb/prices', $this->super, ['audience' => 'institution', 'item_kind' => 'question_answer', 'qb_question_type_id' => $this->mcq, 'amount' => '0.55', 'effective_from' => null])->assertCreated();   // the form's empty = now
        $prices = $this->api('GET', $central, 'super/qb/prices', $this->super)->assertOk()->json('data');
        $this->assertSame('0.55', collect($prices['current'])->firstWhere('qb_question_type_id', $this->mcq)['amount'] ?? null);
        $this->assertSame(2, collect($prices['history'])->where('audience', 'institution')->where('qb_question_type_id', $this->mcq)->count(), 'the old row stays');

        $q = $this->question();
        $body = ['target_type' => 'topic', 'target_ref' => (string) $this->topic->id, 'audience' => 'institution', 'method' => 'percent_off', 'value' => '50'];
        $preview = $this->api('POST', $central, 'super/qb/price-rules/preview', $this->super, $body + ['quote_audience' => 'institution', 'items' => [['type' => 'question', 'id' => $q->id]]])
            ->assertOk()->json('data.0');
        $this->assertSame(['0.55', '0.28', true], [$preview['before']['price'], $preview['after']['price'], $preview['after']['by_this_rule']]);
        $this->assertSame(0, QbPriceRule::count(), 'a preview saves nothing');

        $id = $this->api('POST', $central, 'super/qb/price-rules', $this->super, $body)->assertCreated()->json('data.id');
        $this->api('PUT', $central, "super/qb/price-rules/{$id}", $this->super, ['value' => '10'])->assertStatus(422);
        $this->api('PUT', $central, "super/qb/price-rules/{$id}", $this->super, ['is_active' => false, 'note' => 'প্রচার শেষ'])->assertOk()->assertJsonPath('data.is_active', false);
        $this->assertSame(1, QbPriceRule::count(), 'switched off, never deleted');

        foreach ([['method' => 'free', 'value' => '5'], ['method' => 'first_n_items_free', 'value' => '1.5'], ['method' => 'percent_off', 'value' => '100.01'],
                  ['method' => 'free_for_class_level'], ['target_type' => 'item', 'target_ref' => '12'], ['target_type' => 'all']] as $bad) {
            $this->api('POST', $central, 'super/qb/price-rules', $this->super, $bad + $body)->assertStatus(422);
        }
        $i = $this->makeInstitution('qbprice');
        $this->api('GET', $this->hostOf($i), 'super/qb/price-rules', $this->makeUser($i, 'admin'))->assertNotFound();
    }
}
