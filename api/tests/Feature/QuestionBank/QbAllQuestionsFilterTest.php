<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbClassLevel, QbChapter, QbCurriculumNode, QbCurriculumVersion, QbQuestion, QbQuestionOccurrence, QbQuestionOption, QbQuestionType, QbSubject, QbUnlock, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D133 / D110: qbank's All Questions filters - one or many of class, subject, chapter, question type, source and year - and the
// answer stays locked until the institution has bought the question
class QbAllQuestionsFilterTest extends TestCase
{
    use RefreshDatabase;

    public function test_qbank_filters_select_one_or_many_and_answers_stay_locked(): void
    {
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $mcq = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $short = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short']);
        [$c8, $c9] = [QbClassLevel::create(['name_bn' => '৮ম', 'name_en' => '8']), QbClassLevel::create(['name_bn' => '৯ম', 'name_en' => '9'])];
        [$math, $sci] = [QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Math']), QbSubject::create(['name_bn' => 'বিজ্ঞান', 'name_en' => 'Science'])];
        $ch = QbChapter::create(['qb_subject_id' => $math->id, 'name_bn' => 'বীজগণিত', 'name_en' => 'Algebra', 'number' => 5]);
        $make = function ($type, $subject, $class, $text, $chapter = null, $exam = null, $year = null) use ($super) {
            $q = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'qb_chapter_id' => $chapter?->id, 'question_text' => $text, 'status' => 'published', 'created_by' => $super->id, 'published_at' => now()]);
            $q->classLevels()->attach($class->id);
            if ($type->slug === 'mcq') foreach ([0, 1] as $k) QbQuestionOption::create(['qb_question_id' => $q->id, 'label' => 'x', 'content_text' => "o$k", 'is_correct' => $k === 0, 'sort_order' => $k]);
            if ($exam) QbQuestionOccurrence::create(['qb_question_id' => $q->id, 'board' => 'Dhaka', 'exam_type' => $exam, 'year' => $year]);
            return $q;
        };
        $a = $make($mcq, $math, $c8, 'A-alpha', $ch, 'board', 2023);
        $b = $make($short, $math, $c9, 'B-beta', null, 'test', 2024);
        $c = $make($mcq, $sci, $c9, 'C-gamma');

        $i = $this->makeInstitution('allq');
        $admin = $this->makeUser($i, 'admin');
        Tenancy::as($i, fn () => QbUnlock::create(['item_type' => 'question', 'item_id' => $a->id, 'unlocked_by' => $admin->id, 'price' => '0.00', 'reason' => 'free']));
        $host = $this->hostOf($i);
        $ids = fn (string $qs) => collect($this->api('GET', $host, "question-bank/questions?$qs", $admin)->assertOk()->json('data'))->pluck('id')->sort()->values()->all();

        $this->assertSame([$a->id], $ids("class_level_ids[]={$c8->id}"));
        $this->assertSame([$a->id, $b->id], $ids("subject_ids[]={$math->id}"));
        $this->assertSame([$a->id, $b->id, $c->id], $ids("subject_ids[]={$math->id}&subject_ids[]={$sci->id}"));
        $this->assertSame([$a->id], $ids("chapter_ids[]={$ch->id}"));
        $this->assertSame([$a->id, $c->id], $ids("question_type_ids[]={$mcq->id}"));
        $this->assertSame([$b->id], $ids('source_types[]=test'));
        $this->assertSame([$a->id, $b->id], $ids('years[]=2023&years[]=2024'));
        $this->assertSame([$c->id], $ids("class_level_ids[]={$c9->id}&question_type_ids[]={$mcq->id}"));
        $this->assertSame([$b->id], $ids('q=beta'));

        $r = $this->api('GET', $host, 'question-bank/questions?facets=1&per_page=16', $admin)->assertOk();
        $this->assertSame(['board', 'test'], $r->json('meta.facets.source_types'));
        $this->assertSame([2024, 2023], $r->json('meta.facets.years'));
        $this->assertCount(2, $r->json('meta.facets.question_types'));
        $rows = collect($r->json('data'))->keyBy('id');
        $this->assertSame([$c8->id], $rows[$a->id]['class_level_ids']);
        $this->assertSame('board', $rows[$a->id]['sources'][0]['exam_type']);
        $this->assertTrue($rows[$a->id]['unlocked']);
        $this->assertArrayHasKey('is_correct', $rows[$a->id]['options'][0]);         // bought: which option is right
        $this->assertFalse($rows[$c->id]['unlocked']);
        $this->assertArrayNotHasKey('is_correct', $rows[$c->id]['options'][0]);      // not bought: never the answer
    }

    public function test_language_curriculum_filter_returns_active_versions_and_matches_descendants(): void
    {
        $super = User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000019', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $type = QbQuestionType::create(['slug' => 'language-short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short']);
        $class = QbClassLevel::create(['name_bn' => 'অষ্টম', 'name_en' => 'Class 8']);
        $subject = QbSubject::create(['name_bn' => 'বাংলা ১ম পত্র', 'name_en' => 'Bangla 1st Paper']);
        $subject->classLevels()->attach($class->id);
        $active = QbCurriculumVersion::create(['qb_subject_id' => $subject->id, 'version_key' => 'active', 'name_bn' => 'চলতি', 'name_en' => 'Current', 'is_active' => true]);
        $active->classLevels()->attach($class->id);
        $inactive = QbCurriculumVersion::create(['qb_subject_id' => $subject->id, 'version_key' => 'inactive', 'name_bn' => 'পুরনো', 'name_en' => 'Old', 'is_active' => false]);
        $inactive->classLevels()->attach($class->id);
        $part = QbCurriculumNode::create(['qb_curriculum_version_id' => $active->id, 'kind' => 'Part', 'name_bn' => 'গদ্য', 'name_en' => 'Prose', 'sort_order' => 1]);
        $lesson = QbCurriculumNode::create(['qb_curriculum_version_id' => $active->id, 'parent_id' => $part->id, 'kind' => 'Lesson', 'name_bn' => 'পাঠ ১', 'name_en' => 'Lesson 1', 'sort_order' => 1]);
        QbCurriculumNode::create(['qb_curriculum_version_id' => $inactive->id, 'kind' => 'Part', 'name_bn' => 'পুরনো অংশ', 'name_en' => 'Old part']);
        $make = function (string $text, int $nodeId) use ($super, $type, $subject, $class) {
            $question = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => $text,
                'status' => 'published', 'created_by' => $super->id, 'published_at' => now()]);
            $question->classLevels()->attach($class->id);
            $question->curriculumNodes()->attach($nodeId);
            return $question;
        };
        $nested = $make('Nested question', $lesson->id);
        $other = $make('Other question', QbCurriculumNode::create(['qb_curriculum_version_id' => $active->id, 'kind' => 'Part', 'name_bn' => 'পদ্য', 'name_en' => 'Poetry'])->id);

        $institution = $this->makeInstitution('language-filter');
        $admin = $this->makeUser($institution, 'admin');
        $host = $this->hostOf($institution);
        $versions = $this->api('GET', $host, 'question-bank/curriculum', $admin)->assertOk()->json('data.curriculum_versions');
        $this->assertSame([$active->id], array_column($versions, 'id'));

        $ids = fn (int $nodeId) => collect($this->api('GET', $host, "question-bank/questions?curriculum_node_ids[]={$nodeId}", $admin)
            ->assertOk()->json('data'))->pluck('id')->sort()->values()->all();
        $this->assertSame([$nested->id], $ids($part->id), 'selecting a parent part includes questions linked to its descendants');
        $this->assertSame([$nested->id], $ids($lesson->id));
        $this->assertNotContains($other->id, $ids($part->id));
    }
}
