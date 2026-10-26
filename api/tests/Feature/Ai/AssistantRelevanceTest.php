<?php

namespace Tests\Feature\Ai;

use App\Models\{AiConversation, QbChapter, QbConcept, QbCurriculumNode, QbCurriculumVersion, QbQuestion, QbQuestionType, QbSubject, QbTopic};
use App\Services\Ai\{AssistantService, RelevanceService};
use App\Services\QbQuestionFinderService as F;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\TestCase;

// D166 AI-Q1: exact / close / weak matches; an exact math match stands alone (no near questions, no curriculum); a paraphrase of
// acceleration finds acceleration, not velocity; off-topic questions get a clear not_found; irrelevant curriculum is dropped;
// concepts are found by title (title only); graph tokens never reach the answer; locked answers stay hidden; nothing crosses
// institutions. FULLTEXT sees only committed rows, so this test commits and truncates. Deterministic - no model.
class AssistantRelevanceTest extends TestCase
{
    use DatabaseTruncation;

    protected function tearDown(): void
    {
        $this->truncateDatabaseTables();
        parent::tearDown();
    }

    private function q(string $text, array $options = [], string $secret = 'SECRET'): QbQuestion
    {
        $subject = QbSubject::firstOrCreate(['name_bn' => 'বিজ্ঞান'], ['name_en' => 'Science']);
        $type = QbQuestionType::firstOrCreate(['slug' => 'mcq'], ['name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $q = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => $text,
            'answer_text' => "{$secret}-ANSWER", 'explanation_text' => "{$secret}-EXPLANATION", 'status' => 'published', 'created_by' => 1, 'published_at' => now()]);
        foreach ($options as $i => $o) $q->options()->create(['label' => ['ক', 'খ', 'গ', 'ঘ'][$i], 'content_text' => $o, 'is_correct' => $i === 0, 'sort_order' => $i]);
        return $q;
    }

    private function ask(string $text, string $slug = 'airel')
    {
        $i = \App\Models\Institution::where('slug', $slug)->first() ?? $this->makeInstitution($slug, 'school');
        $t = \App\Models\User::where('institution_id', $i->id)->where('role', 'teacher')->first() ?? $this->makeUser($i, 'teacher');
        $id = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $t->id, 'title' => 'x'])->id);
        return $this->api('POST', $this->hostOf($i), "ai/conversations/{$id}/messages", $t, ['text' => $text])->assertCreated()->json('data.answer');
    }

    private function ids(array $answer, string $type = 'question'): array
    {
        return collect($answer['sources'])->where('type', $type)->pluck('id')->sort()->values()->all();
    }

    public function test_classification_units(): void
    {
        $n = fn ($s) => F::normalize($s);
        $this->assertSame(RelevanceService::EXACT, RelevanceService::classify($n('৪ ও ৬ এর লসাগু কত?'), $n('৪ ও ৬ এর লসাগু কত'))['class']);
        $this->assertSame(RelevanceService::WEAK, RelevanceService::classify($n('৪ ও ৬ এর লসাগু কত'), $n('৮ ও ১২ এর লসাগু কত'))['class'], 'other numbers');
        $this->assertSame(RelevanceService::CLOSE, RelevanceService::classify($n('বস্তুর বেগ পরিবর্তনের হার কী'), $n('সময়ের সাথে বেগের পরিবর্তনের হারকে কী বলে'))['class']);
        $this->assertSame(RelevanceService::WEAK, RelevanceService::classify($n('বস্তুর বেগ পরিবর্তনের হার কী'), $n('সময়ের সাথে সরণের পরিবর্তনের হারকে কী বলে'))['class']);
        $this->assertSame(RelevanceService::WEAK, RelevanceService::classify($n('বাংলাদেশের রাজধানী কোথায়'), $n('বাংলাদেশের জাতীয় ফুল কী'))['class']);
        $this->assertSame([], RelevanceService::terms($n('কী কত কে what is the')));
        $this->assertTrue(RelevanceService::nameRelevant($n('লসাগু নির্ণয়ের নিয়ম'), $n('লসাগু ও গসাগু')));
        $this->assertFalse(RelevanceService::nameRelevant($n('৪ ও ৬ এর লসাগু কত'), $n('গতি')));
        $this->assertSame('ক [চিত্র] খ', RelevanceService::withoutTokens('ক [[qmx-graph:eyJ0eXBlIjoibGluZSJ9]] খ', '[চিত্র]'));
    }

    public function test_exact_math_stands_alone_and_curriculum_is_suppressed(): void
    {
        $lcm = $this->q('৪ ও ৬ এর লসাগু কত', ['১২', '২৪']);
        $this->q('৮ ও ১২ এর লসাগু কত', ['২৪', '৪৮']);
        $this->q('৪ ও ৬ এর গসাগু কত', ['২', '৪']);
        $version = QbCurriculumVersion::create(['qb_subject_id' => QbSubject::first()->id, 'version_key' => 'math-v1', 'name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $node = QbCurriculumNode::create(['qb_curriculum_version_id' => $version->id, 'kind' => 'chapter', 'name_bn' => 'লসাগু ও গসাগু', 'name_en' => 'LCM and HCF']);
        QbCurriculumNode::create(['qb_curriculum_version_id' => $version->id, 'kind' => 'chapter', 'name_bn' => 'গতি', 'name_en' => 'Motion']);
        $this->assertSame([$node->id], $this->ids($this->ask('লসাগু নির্ণয়ের নিয়ম'), 'curriculum'), 'a fitting chapter, not an unrelated one');
        $a = $this->ask('৪ ও ৬ এর লসাগু কত');
        $this->assertSame('composed', $a['kind']);
        $this->assertSame([$lcm->id], $this->ids($a), 'only the exact question');
        $this->assertSame([], $this->ids($a, 'curriculum'), 'no curriculum next to an exact match');
    }

    public function test_paraphrase_finds_acceleration_not_velocity(): void
    {
        $acc = $this->q('সময়ের সাথে বেগের পরিবর্তনের হারকে কী বলে', ['ত্বরণ', 'বেগ']);
        $vel = $this->q('সময়ের সাথে সরণের পরিবর্তনের হারকে কী বলে', ['বেগ', 'দ্রুতি']);
        $a = $this->ask('বস্তুর বেগ পরিবর্তনের হার কী');
        $this->assertContains($acc->id, $this->ids($a));
        $this->assertNotContains($vel->id, $this->ids($a));
        $this->assertSame($acc->id, app(AssistantService::class)->rankedQuestionIds('বস্তুর বেগ পরিবর্তনের হার কী')[0] ?? null);
    }

    public function test_off_topic_is_not_found_and_concepts_by_title(): void
    {
        $this->q('সময়ের সাথে বেগের পরিবর্তনের হারকে কী বলে', ['ত্বরণ', 'বেগ']);
        $this->q('বাংলাদেশের জাতীয় ফুল কী', ['শাপলা', 'গোলাপ']);
        foreach (['বাংলাদেশের রাজধানী কোথায়', 'Is a dolphin a mammal?', 'কী কত কে'] as $off) {
            $this->assertSame('not_found', $this->ask($off)['kind'], $off);
        }
        $ch = QbChapter::create(['qb_subject_id' => QbSubject::first()->id, 'name_bn' => 'গতি', 'name_en' => 'Motion']);
        $topic = QbTopic::create(['qb_chapter_id' => $ch->id, 'name_bn' => 'ত্বরণ', 'name_en' => 'Acceleration']);
        $c = QbConcept::create(['qb_topic_id' => $topic->id, 'title_bn' => 'সমত্বরণ ও অসমত্বরণ', 'title_en' => 'Uniform acceleration', 'body_text' => 'CONCEPT-BODY', 'status' => 'published', 'created_by' => 1]);
        $a = $this->ask('অসমত্বরণ কাকে বলে');
        $this->assertSame([$c->id], $this->ids($a, 'concept'));
        $this->assertStringNotContainsString('CONCEPT-BODY', json_encode($a, JSON_UNESCAPED_UNICODE), 'a concept title only, never its body');
    }

    public function test_graph_tokens_never_reach_the_answer_and_locked_answers_stay_hidden(): void
    {
        \App\Models\PlatformSetting::write(AssistantService::QUOTA_KEY, 0);
        $this->q('নিচের লেখচিত্রে [[qmx-graph:eyJ4IjpbMSwyXX0]] ঢাল কত', ['২', '৩'], 'LOCKED');
        $a = $this->ask('নিচের লেখচিত্রে ঢাল কত', 'airel2');
        $json = json_encode($a, JSON_UNESCAPED_UNICODE);
        $this->assertSame('composed', $a['kind']);
        foreach (['qmx-graph', 'eyJ4IjpbMSwyXX0', 'LOCKED-ANSWER', 'LOCKED-EXPLANATION', '✓'] as $bad) $this->assertStringNotContainsString($bad, $json, $bad);
        $this->assertStringContainsString('[চিত্র]', $a['body']);
        $other = $this->ask('নিচের লেখচিত্রে ঢাল কত', 'airel3');                     // another institution: the same platform question, no tenant data
        $this->assertSame($this->ids($a), $this->ids($other));
    }
}
