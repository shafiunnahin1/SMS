<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{AuditLog, Program, QbChapter, QbClassLevel, QbCurriculumNode, QbCurriculumVersion, QbQuestion, QbQuestionType, QbSubject, QbTopic, User};
use App\Support\Tenancy;
use Database\Seeders\QbCurriculumSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// QB.1 (D65, docs/modules/question-bank.md §3ক): the Super Admin builds the platform curriculum class → subject → chapter →
// topic on the central host; every other role is refused; a node in use cannot be deleted; an institution's admin links a
// program to an active platform class while the question bank is on; the qbank seed is idempotent.
class QbCurriculumTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $super;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->super = $this->makeUser(null, 'super_admin');
    }

    private function add(string $kind, array $body): int
    {
        return $this->api('POST', $this->central, "super/qb/{$kind}", $this->super, $body)->assertCreated()->json('data.id');
    }

    public function test_only_the_super_admin_on_the_central_host(): void
    {
        $i = $this->makeInstitution('qbguard');
        $body = ['name_bn' => 'নবম', 'name_en' => 'Nine'];
        foreach (['admin', 'teacher', 'accountant', 'parent'] as $role) {
            $u = $this->makeUser($i, $role);
            $this->api('GET', $this->central, 'super/qb/curriculum', $u)->assertForbidden();
            $this->api('POST', $this->central, 'super/qb/class-levels', $u, $body)->assertForbidden();
        }
        foreach (['content_writer', 'content_moderator'] as $role) {
            $this->api('POST', $this->central, 'super/qb/class-levels', $this->makeUser(null, $role), $body)->assertForbidden();
        }
        $this->api('GET', $this->central, 'super/qb/curriculum')->assertUnauthorized();
        $this->api('GET', $this->hostOf($i), 'super/qb/curriculum', $this->super)->assertNotFound();
        $this->api('POST', $this->central, 'super/qb/books', $this->super, $body)->assertNotFound();      // unknown {kind}
        $this->assertSame(0, QbClassLevel::count());
    }

    public function test_the_super_admin_builds_the_tree(): void
    {
        $nine = $this->add('class-levels', ['name_bn' => '৯ম শ্রেণি', 'name_en' => 'Class 9', 'education_level' => 'secondary', 'sort_order' => 9]);
        $ten = $this->add('class-levels', ['name_bn' => '১০ম শ্রেণি', 'name_en' => 'Class 10', 'education_level' => 'secondary', 'sort_order' => 10]);
        $physics = $this->add('subjects', ['name_bn' => 'পদার্থ', 'name_en' => 'Physics', 'code' => '136', 'class_level_ids' => [$nine, $ten]]);
        $motion = $this->add('chapters', ['qb_subject_id' => $physics, 'name_bn' => 'গতি', 'name_en' => 'Motion', 'number' => 2, 'class_level_ids' => [$nine]]);
        $this->add('topics', ['qb_chapter_id' => $motion, 'name_bn' => 'দ্রুতি', 'name_en' => 'Speed']);

        $tree = $this->api('GET', $this->central, 'super/qb/curriculum', $this->super)->assertOk()->json('data');
        $this->assertSame(['Class 9', 'Class 10'], array_column($tree['class_levels'], 'name_en'));
        $this->assertSame('Physics', $tree['subjects'][0]['name_en']);
        $this->assertEqualsCanonicalizing([$nine, $ten], $tree['subjects'][0]['class_level_ids']);
        $this->assertSame(['Motion', 2, [$nine]], [$tree['subjects'][0]['chapters'][0]['name_en'], $tree['subjects'][0]['chapters'][0]['number'], $tree['subjects'][0]['chapters'][0]['class_level_ids']]);
        $this->assertSame('Speed', $tree['subjects'][0]['chapters'][0]['topics'][0]['name_en']);
        $this->assertSame(1, Tenancy::withoutTenancy(fn () => AuditLog::whereNull('institution_id')->where('action', 'qb.topics.created')->count()));

        // edit: rename, re-link the classes; a chapter never moves to another subject
        $this->api('PUT', $this->central, "super/qb/subjects/{$physics}", $this->super, ['name_en' => 'Physics (SSC)', 'class_level_ids' => [$ten]])->assertOk();
        $this->assertSame(['Physics (SSC)', [$ten]], [QbSubject::find($physics)->name_en, QbSubject::find($physics)->classLevels->pluck('id')->all()]);
        $this->api('PUT', $this->central, "super/qb/chapters/{$motion}", $this->super, ['qb_subject_id' => $physics])->assertStatus(422)->assertJsonValidationErrors('qb_subject_id');
        $this->api('PUT', $this->central, "super/qb/class-levels/{$nine}", $this->super, ['is_active' => false])->assertOk();
        $this->assertFalse(QbClassLevel::find($nine)->is_active);
    }

    public function test_versioned_curriculum_is_arbitrary_depth_ordered_and_linked_to_questions(): void
    {
        $subject = $this->add('subjects', ['name_bn' => 'বাংলা ১ম পত্র', 'name_en' => 'Bangla 1st Paper']);
        $version = $this->api('POST', $this->central, 'super/qb/curriculum-versions', $this->super, [
            'qb_subject_id' => $subject, 'version_key' => 'current', 'name_bn' => 'বর্তমান', 'name_en' => 'Current', 'sort_order' => 1,
        ])->assertCreated()->json('data.id');
        $part = $this->api('POST', $this->central, 'super/qb/curriculum-nodes', $this->super, [
            'qb_curriculum_version_id' => $version, 'kind' => 'Part', 'name_bn' => 'গদ্য', 'name_en' => 'Prose', 'sort_order' => 1,
        ])->assertCreated()->json('data.id');
        $text = $this->api('POST', $this->central, 'super/qb/curriculum-nodes', $this->super, [
            'qb_curriculum_version_id' => $version, 'parent_id' => $part, 'kind' => 'Text', 'name_bn' => 'অপরিচিতা', 'name_en' => 'Aparichita', 'sort_order' => 2,
        ])->assertCreated()->json('data.id');
        $topic = $this->api('POST', $this->central, 'super/qb/curriculum-nodes', $this->super, [
            'qb_curriculum_version_id' => $version, 'parent_id' => $text, 'kind' => 'Topic', 'name_bn' => 'লেখক পরিচিতি', 'name_en' => 'Author',
        ])->assertCreated()->json('data.id');
        $tree = $this->api('GET', $this->central, 'writer/curriculum', $this->makeUser(null, 'content_writer'))->assertOk()->json('data');
        $this->assertSame('লেখক পরিচিতি', $tree['curriculum_versions'][0]['nodes'][0]['children'][0]['children'][0]['name_bn']);
        $this->api('PUT', $this->central, "super/qb/curriculum-nodes/{$topic}", $this->super, ['parent_id' => $topic])->assertStatus(422)->assertJsonValidationErrors('parent_id');
        $this->api('PUT', $this->central, "super/qb/curriculum-nodes/{$part}", $this->super, ['parent_id' => $topic])->assertStatus(422)->assertJsonValidationErrors('parent_id');

        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short']);
        $writer = $this->makeUser(null, 'content_writer');
        $question = $this->api('POST', $this->central, 'writer/questions', $writer, [
            'qb_question_type_id' => $type->id, 'qb_subject_id' => $subject, 'question_text' => 'লেখক কে?', 'answer_text' => 'রবীন্দ্রনাথ',
            'curriculum_node_ids' => [$text, $topic], 'occurrences' => [['exam_type' => 'HSC', 'question_number' => '৩', 'set_label' => 'খ', 'year' => 2026, 'page_reference' => 'পৃষ্ঠা ৫']],
        ])->assertCreated()->json('data.id');
        $opened = $this->api('GET', $this->central, "writer/questions/{$question}", $writer)->assertOk()->json('data');
        $this->assertSame([$text, $topic], $opened['curriculum_node_ids']);
        $this->assertSame('Bangla 1st Paper', $opened['curriculum_breadcrumbs'][0]['subject_name_en']);
        $this->assertSame(['Prose', 'Aparichita'], array_column($opened['curriculum_breadcrumbs'][0]['path'], 'name_en'));
        $this->api('PUT', $this->central, "writer/questions/{$question}", $writer, ['curriculum_node_ids' => [$topic, $text]])->assertOk();
        $reordered = $this->api('GET', $this->central, "writer/questions/{$question}", $writer)->assertOk()->json('data');
        $this->assertSame([$topic, $text], $reordered['curriculum_node_ids']);
        $this->assertSame([['Prose', 'Aparichita', 'Author'], ['Prose', 'Aparichita']], array_map(fn ($breadcrumb) => array_column($breadcrumb['path'], 'name_en'), $reordered['curriculum_breadcrumbs']));
        $this->assertSame(['৩', 'খ', 'পৃষ্ঠা ৫'], [$opened['occurrences'][0]['question_number'], $opened['occurrences'][0]['set_label'], $opened['occurrences'][0]['page_reference']]);
        $listed = $this->api('GET', $this->central, 'writer/questions', $writer, ['curriculum_node_ids' => [$topic]])->assertOk()->json('data');
        $this->assertSame([$question], array_column($listed, 'id'));
        $this->assertContains(['Prose', 'Aparichita', 'Author'], array_map(fn ($breadcrumb) => array_column($breadcrumb['path'], 'name_en'), $listed[0]['curriculum_breadcrumbs']));
        $this->api('PUT', $this->central, "writer/questions/{$question}", $writer, ['curriculum_node_ids' => [$topic]])->assertOk();
        $this->assertSame([$topic], $this->api('GET', $this->central, "writer/questions/{$question}", $writer)->json('data.curriculum_node_ids'));
        $this->api('PUT', $this->central, "writer/questions/{$question}", $writer, ['curriculum_node_ids' => []])->assertOk();
        $this->assertSame([], $this->api('GET', $this->central, "writer/questions/{$question}", $writer)->json('data.curriculum_node_ids'));
        $this->api('DELETE', $this->central, "super/qb/curriculum-nodes/{$part}", $this->super)->assertStatus(422);
        $this->api('DELETE', $this->central, "super/qb/curriculum-versions/{$version}", $this->super)->assertStatus(422);
        $this->assertSame(3, QbCurriculumNode::count());
        $this->assertSame(1, QbCurriculumVersion::count());
    }

    public function test_content_writer_can_create_only_the_first_active_language_paper_version(): void
    {
        $subject = $this->add('subjects', ['name_bn' => 'ইংরেজি ১ম পত্র', 'name_en' => 'English 1st Paper']);
        $writer = $this->makeUser(null, 'content_writer');
        $body = ['qb_subject_id' => $subject, 'version_key' => '2026', 'name_bn' => '২০২৬', 'name_en' => '2026', 'is_active' => false];

        $this->api('POST', $this->central, 'writer/qb/curriculum-versions', $writer, $body)->assertCreated()
            ->assertJsonPath('data.is_active', true);
        $this->assertSame(1, QbCurriculumVersion::where('qb_subject_id', $subject)->count());
        $this->api('GET', $this->central, 'writer/curriculum', $writer)->assertOk()
            ->assertJsonPath('data.curriculum_versions.0.qb_subject_id', $subject);
        $anotherWriter = $this->makeUser(null, 'content_writer');
        $this->api('GET', $this->central, 'writer/curriculum', $anotherWriter)->assertOk()
            ->assertJsonPath('data.curriculum_versions.0.qb_subject_id', $subject);

        $type = QbQuestionType::create(['slug' => 'd143-short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short']);
        $node = $this->api('POST', $this->central, 'writer/qb/curriculum-nodes', $writer, [
            'qb_curriculum_version_id' => QbCurriculumVersion::where('qb_subject_id', $subject)->value('id'),
            'kind' => 'Part', 'name_bn' => 'পাঠ', 'name_en' => 'Reading', 'sort_order' => 1,
        ])->assertCreated()->json('data.id');
        $createdQuestion = $this->api('POST', $this->central, 'writer/questions', $writer, [
            'qb_question_type_id' => $type->id, 'qb_subject_id' => $subject, 'question_text' => 'First draft', 'curriculum_node_ids' => [$node],
        ])->assertCreated()->assertJsonPath('data.status', 'draft');
        $question = $createdQuestion->json('data.id');
        $this->assertSame([$node], $this->api('GET', $this->central, "writer/questions/{$question}", $writer)->assertOk()->json('data.curriculum_node_ids'));
        $this->api('PUT', $this->central, "writer/questions/{$question}", $writer, ['question_text' => 'Edited draft', 'curriculum_node_ids' => [$node]])
            ->assertOk()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.question_text', 'Edited draft')->assertJsonPath('data.curriculum_node_ids.0', $node);

        $this->api('POST', $this->central, 'writer/qb/curriculum-versions', $writer, [...$body, 'version_key' => '2027'])
            ->assertStatus(422)->assertJsonValidationErrors('qb_subject_id');
        $this->assertSame(1, QbCurriculumVersion::where('qb_subject_id', $subject)->count());
        $this->assertSame(1, QbCurriculumNode::where('name_en', 'Reading')->count());
    }

    public function test_writer_initial_version_is_limited_to_language_papers_and_the_central_host(): void
    {
        $physics = $this->add('subjects', ['name_bn' => 'পদার্থ', 'name_en' => 'Physics']);
        $body = ['qb_subject_id' => $physics, 'version_key' => '2026', 'name_bn' => '২০২৬', 'name_en' => '2026'];
        $writer = $this->makeUser(null, 'content_writer');
        $moderator = $this->makeUser(null, 'content_moderator');
        $institution = $this->makeInstitution('qbversiontenant');

        $this->api('POST', $this->central, 'writer/qb/curriculum-versions', $writer, $body)->assertForbidden();
        $this->api('POST', $this->central, 'writer/qb/curriculum-versions', $moderator, $body)->assertForbidden();
        $this->api('POST', $this->hostOf($institution), 'writer/qb/curriculum-versions', $writer, $body)->assertNotFound();
        $this->assertSame(0, QbCurriculumVersion::count());
    }

    public function test_writer_cannot_create_a_version_when_an_inactive_version_exists(): void
    {
        $subject = $this->add('subjects', ['name_bn' => 'বাংলা ২য় পত্র', 'name_en' => 'Bangla 2nd Paper']);
        QbCurriculumVersion::create(['qb_subject_id' => $subject, 'version_key' => 'old', 'name_bn' => 'পুরোনো', 'name_en' => 'Old', 'is_active' => false]);
        $writer = $this->makeUser(null, 'content_writer');

        $this->api('POST', $this->central, 'writer/qb/curriculum-versions', $writer, [
            'qb_subject_id' => $subject, 'version_key' => 'new', 'name_bn' => 'নতুন', 'name_en' => 'New',
        ])->assertStatus(422)->assertJsonValidationErrors('qb_subject_id');
        $this->assertSame(1, QbCurriculumVersion::where('qb_subject_id', $subject)->count());
    }

    public function test_input_is_checked(): void
    {
        $this->api('POST', $this->central, 'super/qb/class-levels', $this->super, ['name_bn' => 'x'])->assertStatus(422)->assertJsonValidationErrors('name_en');
        $this->api('POST', $this->central, 'super/qb/class-levels', $this->super, ['name_bn' => 'x', 'name_en' => 'x', 'education_level' => 'nursery'])->assertStatus(422)->assertJsonValidationErrors('education_level');
        $this->api('POST', $this->central, 'super/qb/subjects', $this->super, ['name_bn' => 'x', 'name_en' => 'x', 'class_level_ids' => [999]])->assertStatus(422)->assertJsonValidationErrors('class_level_ids.0');
        $this->api('POST', $this->central, 'super/qb/chapters', $this->super, ['name_bn' => 'x', 'name_en' => 'x', 'qb_subject_id' => 999])->assertStatus(422)->assertJsonValidationErrors('qb_subject_id');
        $this->api('POST', $this->central, 'super/qb/topics', $this->super, ['name_bn' => 'x', 'name_en' => 'x'])->assertStatus(422)->assertJsonValidationErrors('qb_chapter_id');
        $this->api('PUT', $this->central, 'super/qb/topics/999', $this->super, ['name_en' => 'y'])->assertNotFound();
    }

    public function test_a_node_in_use_is_never_deleted(): void
    {
        $class = $this->add('class-levels', ['name_bn' => 'ক', 'name_en' => 'C']);
        $subject = $this->add('subjects', ['name_bn' => 'খ', 'name_en' => 'S', 'class_level_ids' => [$class]]);
        $chapter = $this->add('chapters', ['qb_subject_id' => $subject, 'name_bn' => 'গ', 'name_en' => 'Ch', 'class_level_ids' => [$class]]);
        $topic = $this->add('topics', ['qb_chapter_id' => $chapter, 'name_bn' => 'ঘ', 'name_en' => 'T']);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $q = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject, 'qb_chapter_id' => $chapter, 'qb_topic_id' => $topic,
            'question_text' => '?', 'status' => 'draft', 'created_by' => $this->super->id]);
        $q->delete();                                                                     // even a deleted (trashed) question keeps its topic

        foreach ([['class-levels', $class], ['subjects', $subject], ['chapters', $chapter], ['topics', $topic]] as [$kind, $id]) {
            $this->api('DELETE', $this->central, "super/qb/{$kind}/{$id}", $this->super)->assertStatus(422)->assertJsonPath('error', 'qb_in_use');
        }
        $q->forceDelete();
        // bottom-up the tree can be removed
        foreach ([['topics', $topic], ['chapters', $chapter], ['subjects', $subject], ['class-levels', $class]] as [$kind, $id]) {
            $this->api('DELETE', $this->central, "super/qb/{$kind}/{$id}", $this->super)->assertOk();
        }
        $this->assertSame([0, 0, 0, 0], [QbClassLevel::count(), QbSubject::count(), QbChapter::count(), QbTopic::count()]);
    }

    public function test_a_class_linked_by_any_institutions_program_is_in_use(): void
    {
        $class = $this->add('class-levels', ['name_bn' => 'ক', 'name_en' => 'C']);
        $i = $this->makeInstitution('qblinked');
        Tenancy::as($i, fn () => Program::create(['name' => 'Nine', 'qb_class_level_id' => $class]));
        $this->api('DELETE', $this->central, "super/qb/class-levels/{$class}", $this->super)->assertStatus(422)->assertJsonPath('error', 'qb_in_use');
    }

    public function test_an_institution_admin_links_a_program_to_an_active_platform_class(): void
    {
        $active = QbClassLevel::create(['name_bn' => '৯ম', 'name_en' => 'Class 9', 'education_level' => 'secondary']);
        $off = QbClassLevel::create(['name_bn' => 'পুরনো', 'name_en' => 'Old', 'is_active' => false]);
        $i = $this->makeInstitution('qbschool');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);

        $list = $this->api('GET', $host, 'qb/class-levels', $admin)->assertOk()->json('data');
        $this->assertSame([$active->id], array_column($list, 'id'));
        $this->api('GET', $host, 'qb/class-levels', $this->makeUser($i, 'teacher'))->assertForbidden();

        $pid = $this->api('POST', $host, 'programs', $admin, ['name' => 'Nine', 'qb_class_level_id' => $active->id])->assertCreated()->json('data.id');
        $this->assertSame($active->id, $this->api('GET', $host, "programs/{$pid}", $admin)->json('data.qb_class_level_id'));
        $this->api('PUT', $host, "programs/{$pid}", $admin, ['qb_class_level_id' => $off->id])->assertStatus(422)->assertJsonValidationErrors('qb_class_level_id');
        $this->api('PUT', $host, "programs/{$pid}", $admin, ['qb_class_level_id' => null])->assertOk();

        // the question bank switched off for this institution: no list, no link
        $i->forceFill(['enabled_modules' => ['question_bank' => false]])->save();
        $this->api('GET', $host, 'qb/class-levels', $admin)->assertForbidden();
        $this->api('PUT', $host, "programs/{$pid}", $admin, ['qb_class_level_id' => $active->id])->assertStatus(422)->assertJsonValidationErrors('qb_class_level_id');
    }

    public function test_the_qbank_seed_is_complete_and_idempotent(): void
    {
        $this->seed(QbCurriculumSeeder::class);
        $this->seed(QbCurriculumSeeder::class);
        $this->assertSame([15, 55], [QbClassLevel::count(), QbSubject::count()]);
        $nine = QbClassLevel::where('name_en', 'Class 9')->firstOrFail();
        $this->assertSame(['৯ম শ্রেণি', 'secondary'], [$nine->name_bn, $nine->education_level]);
        $this->assertContains('Physics', $nine->subjects->pluck('name_en')->all());
        $this->assertNotContains('Physics', QbClassLevel::where('name_en', 'Class 5')->first()->subjects->pluck('name_en')->all());
        $this->assertSame('other', QbClassLevel::where('name_en', 'Play')->first()->education_level);
    }
}
