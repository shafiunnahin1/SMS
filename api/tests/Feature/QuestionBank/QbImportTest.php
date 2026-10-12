<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbQuestionItem, QbQuestionStimulus, QbChapter, QbClassLevel, QbCreativePart, QbImportMap, QbMedia, QbMediaLink, QbQuestion, QbQuestionClassLevel, QbQuestionOccurrence, QbQuestionOption,
    QbQuestionType, QbSubject, QbTopic, User};
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Schema, Storage};
use Tests\TestCase;

// QB.11 (D69): qb:import-from-qbank on a small qbank fixture (an in-memory sqlite with qbank's own column names): the dry run counts
// and keeps nothing; the real run imports curriculum, a type by slug, questions (as `review`) with options, first-level creative
// parts, class links, occurrences and a picture; a second run changes nothing; what it cannot take is reported, not guessed.
class QbImportTest extends TestCase
{
    use RefreshDatabase;

    private string $media;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
        QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);   // seeded here already (qbank's slugs)
        config(['database.connections.qbank' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false]]);
        DB::purge('qbank');
        $s = Schema::connection('qbank');
        $s->create('education_levels', fn (Blueprint $t) => [$t->id(), $t->string('slug')]);
        $s->create('class_levels', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('education_level_id'), $t->string('name_bn'), $t->string('name_en'), $t->integer('sort_order')->default(0), $t->boolean('is_active')->default(true)]);
        $s->create('subjects', fn (Blueprint $t) => [$t->id(), $t->string('name_bn'), $t->string('name_en'), $t->string('code')->nullable(), $t->integer('sort_order')->default(0), $t->boolean('is_active')->default(true)]);
        $s->create('class_level_subject', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('class_level_id'), $t->unsignedBigInteger('subject_id')]);
        $s->create('chapters', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('subject_id'), $t->string('name_bn'), $t->string('name_en')->nullable(), $t->string('chapter_number')->nullable(), $t->integer('sort_order')->default(0)]);
        $s->create('chapter_class_level', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('chapter_id'), $t->unsignedBigInteger('class_level_id')]);
        $s->create('topics', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('chapter_id'), $t->string('name_bn'), $t->string('name_en')->nullable(), $t->integer('sort_order')->default(0)]);
        $s->create('question_types', fn (Blueprint $t) => [$t->id(), $t->string('slug'), $t->string('name_bn'), $t->string('name_en'), $t->integer('sort_order')->default(0), $t->boolean('is_active')->default(true)]);
        $s->create('questions', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('question_type_id'), $t->unsignedBigInteger('subject_id'), $t->unsignedBigInteger('chapter_id')->nullable(),
            $t->unsignedBigInteger('topic_id')->nullable(), $t->text('question_text')->nullable(), $t->text('answer_text')->nullable(), $t->text('explanation_text')->nullable(),
            $t->text('question_content_json')->nullable(), $t->text('answer_content_json')->nullable(), $t->text('explanation_content_json')->nullable(),
            $t->unsignedBigInteger('question_stimulus_id')->nullable(), $t->string('content_mode')->default('plain_text'), $t->string('difficulty')->default('medium'), $t->decimal('marks', 8, 2)->nullable(), $t->string('language')->default('bn'), $t->string('status')->default('published')]);
        $s->create('class_level_question', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('class_level_id'), $t->unsignedBigInteger('question_id')]);
        $s->create('question_options', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('question_id'), $t->string('option_label'), $t->text('option_text')->nullable(), $t->text('option_content_json')->nullable(), $t->boolean('is_correct')->default(false), $t->integer('sort_order')->default(0)]);
        $s->create('creative_question_parts', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('question_id'), $t->unsignedBigInteger('parent_id')->nullable(), $t->string('part_label'), $t->string('cognitive_level')->nullable(),
            $t->text('question_text')->nullable(), $t->text('answer_text')->nullable(), $t->text('question_content_json')->nullable(), $t->text('answer_content_json')->nullable(), $t->decimal('marks', 8, 2)->nullable(), $t->integer('sort_order')->default(0)]);
        $s->create('boards', fn (Blueprint $t) => [$t->id(), $t->string('name_bn')]);
        $s->create('question_occurrences', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('question_id'), $t->unsignedBigInteger('board_id')->nullable(), $t->unsignedBigInteger('institution_id')->nullable(),
            $t->unsignedBigInteger('exam_type_id')->nullable(), $t->string('exam_name')->nullable(), $t->integer('exam_year')->nullable(), $t->string('paper_name')->nullable(), $t->string('question_number')->nullable(), $t->string('source_title')->nullable()]);
        $s->create('question_items', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('question_id')]);
        $s->create('question_stimuli', fn (Blueprint $t) => [$t->id(), $t->text('content_text')->nullable()]);   // qbank: no question_id - the question points at it
        $s->create('media_files', fn (Blueprint $t) => [$t->id(), $t->string('stored_name'), $t->string('file_path'), $t->string('mime_type'), $t->unsignedBigInteger('file_size')]);
        $s->create('media_attachments', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('media_file_id'), $t->string('attachable_type'), $t->unsignedBigInteger('attachable_id')]);

        $q = DB::connection('qbank');
        $q->table('education_levels')->insert(['id' => 1, 'slug' => 'secondary']);
        $q->table('class_levels')->insert(['id' => 10, 'education_level_id' => 1, 'name_bn' => 'নবম', 'name_en' => 'Nine']);
        $q->table('subjects')->insert(['id' => 20, 'name_bn' => 'পদার্থ', 'name_en' => 'Physics', 'code' => '136']);
        $q->table('class_level_subject')->insert(['class_level_id' => 10, 'subject_id' => 20]);
        $q->table('chapters')->insert([['id' => 30, 'subject_id' => 20, 'name_bn' => 'গতি', 'name_en' => null, 'chapter_number' => '2'], ['id' => 31, 'subject_id' => 99, 'name_bn' => 'অনাথ', 'name_en' => null, 'chapter_number' => 'ক']]);
        $q->table('topics')->insert(['id' => 40, 'chapter_id' => 30, 'name_bn' => 'বেগ']);
        $q->table('question_types')->insert([['id' => 1, 'slug' => 'mcq', 'name_bn' => 'x', 'name_en' => 'x'], ['id' => 2, 'slug' => 'odd_new_type', 'name_bn' => 'নতুন', 'name_en' => 'New']]);
        $q->table('questions')->insert([
            ['id' => 100, 'question_type_id' => 1, 'subject_id' => 20, 'chapter_id' => 30, 'topic_id' => 40, 'question_text' => 'বেগের একক?', 'difficulty' => 'hard', 'marks' => 1, 'content_mode' => 'mixed_content'],
            ['id' => 101, 'question_type_id' => 2, 'subject_id' => 20, 'chapter_id' => null, 'topic_id' => null, 'question_text' => 'সৃজনশীল প্রশ্ন', 'difficulty' => 'medium', 'marks' => 10, 'content_mode' => 'plain_text'],
            ['id' => 102, 'question_type_id' => 1, 'subject_id' => 20, 'chapter_id' => null, 'topic_id' => null, 'question_text' => '', 'difficulty' => 'easy', 'marks' => null, 'content_mode' => 'plain_text'],
            ['id' => 104, 'question_type_id' => 1, 'subject_id' => 20, 'chapter_id' => null, 'topic_id' => null, 'question_text' => 'অপশনহীন MCQ', 'difficulty' => 'easy', 'marks' => null, 'content_mode' => 'plain_text'],
            ['id' => 103, 'question_type_id' => 1, 'subject_id' => 20, 'chapter_id' => null, 'topic_id' => null, 'question_text' => 'অনুচ্ছেদ পড়ে উত্তর দাও', 'difficulty' => 'easy', 'marks' => null, 'content_mode' => 'plain_text'],
        ]);
        $q->table('class_level_question')->insert(['class_level_id' => 10, 'question_id' => 100]);
        $q->table('question_options')->insert([['question_id' => 100, 'option_label' => 'ক', 'option_text' => 'মি/সে', 'is_correct' => true, 'sort_order' => 1], ['question_id' => 100, 'option_label' => 'খ', 'option_text' => 'কেজি', 'is_correct' => false, 'sort_order' => 2]]);
        $q->table('creative_question_parts')->insert([['id' => 1, 'question_id' => 101, 'parent_id' => null, 'part_label' => 'ক', 'cognitive_level' => 'comprehension', 'question_text' => 'বেগ কী?', 'marks' => 1],
            ['id' => 2, 'question_id' => 101, 'parent_id' => 1, 'part_label' => 'i', 'cognitive_level' => 'knowledge', 'question_text' => 'nested', 'marks' => 1]]);
        $q->table('boards')->insert(['id' => 5, 'name_bn' => 'ঢাকা বোর্ড']);
        $q->table('question_occurrences')->insert(['question_id' => 100, 'board_id' => 5, 'exam_name' => 'SSC', 'exam_year' => 2023, 'question_number' => '7']);
        $q->table('question_items')->insert(['question_id' => 103]);
        $q->table('question_stimuli')->insert(['id' => 7, 'content_text' => 'passage']);
        $q->table('questions')->where('id', 103)->update(['question_stimulus_id' => 7]);
        $this->media = sys_get_temp_dir() . '/qbank-media-' . uniqid();
        @mkdir("{$this->media}/questions", 0777, true);
        file_put_contents("{$this->media}/questions/fig.png", 'PNGDATA');
        $q->table('media_files')->insert([['id' => 1, 'stored_name' => 'fig.png', 'file_path' => 'questions/fig.png', 'mime_type' => 'image/png', 'file_size' => 7],
            ['id' => 2, 'stored_name' => 'gone.png', 'file_path' => 'questions/gone.png', 'mime_type' => 'image/png', 'file_size' => 7]]);
        $q->table('media_attachments')->insert([['media_file_id' => 1, 'attachable_type' => 'question', 'attachable_id' => 100], ['media_file_id' => 2, 'attachable_type' => 'question_option', 'attachable_id' => 1]]);
    }

    private function counts(): array
    {
        return [QbClassLevel::count(), QbSubject::count(), QbChapter::count(), QbTopic::count(), QbQuestionType::count(), QbQuestion::count(), QbQuestionOption::count(),
            QbCreativePart::count(), QbQuestionClassLevel::count(), QbQuestionOccurrence::count(), QbMedia::count(), QbMediaLink::count(), QbImportMap::count()];
    }

    public function test_dry_run_then_import_once_and_a_second_run_changes_nothing(): void
    {
        $before = $this->counts();
        $this->artisan('qb:import-from-qbank', ['--dry-run' => true, '--media-path' => $this->media])->expectsOutputToContain('DRY RUN')->assertSuccessful();
        $this->assertSame($before, $this->counts(), 'the dry run keeps nothing');
        Storage::disk('private')->assertDirectoryEmpty('platform/qb/imported');

        $this->artisan('qb:import-from-qbank', ['--media-path' => $this->media])->expectsOutputToContain('Imported.')->assertSuccessful();
        $after = $this->counts();
        //            levels subj chap topic types qs  opts parts clq  occ  media links map
        $this->assertSame([1, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 12], $after);   // occurrences and class links come with their question (no map row)

        $q = QbQuestion::where('question_text', 'বেগের একক?')->firstOrFail();
        $this->assertSame(['review', 4, 'mixed', '1.00'], [$q->status, $q->difficulty, $q->content_mode, (string) $q->marks]);
        $this->assertSame(QbTopic::value('id'), $q->qb_topic_id);
        $this->assertSame(['ক', true], [QbQuestionOption::where('qb_question_id', $q->id)->orderBy('sort_order')->value('label'), (bool) QbQuestionOption::where('is_correct', true)->value('is_correct')]);
        $this->assertSame('understanding', QbCreativePart::value('cognitive_level'));
        $this->assertSame(['ঢাকা বোর্ড', 2023, 'SSC · #7'], [QbQuestionOccurrence::value('board'), QbQuestionOccurrence::value('year'), QbQuestionOccurrence::value('note')]);
        $this->assertSame(['secondary', 'Physics', 'গতি'], [QbClassLevel::value('education_level'), QbSubject::value('name_en'), QbChapter::value('name_en')]);   // a missing English name falls back to Bengali
        $this->assertSame('other', QbQuestionType::where('slug', 'odd_new_type')->value('family'));
        $this->assertSame('PNGDATA', Storage::disk('private')->get(QbMedia::value('path')));

        $this->artisan('qb:import-from-qbank', ['--media-path' => $this->media])->assertSuccessful();
        $this->assertSame($after, $this->counts(), 'a second run changes nothing');
    }

    public function test_what_cannot_come_over_is_reported(): void
    {
        \Illuminate\Support\Facades\Artisan::call('qb:import-from-qbank', ['--dry-run' => true]);
        $report = \Illuminate\Support\Facades\Artisan::output();                     // output() empties itself: read it once
        $this->assertStringContainsString('has structured parts', $report, 'a question with items / a passage is not taken half-empty');
        $this->assertSame(0, QbQuestion::where('question_text', 'অনুচ্ছেদ পড়ে উত্তর দাও')->count());
        $this->assertStringContainsString('a choice question without its options', $report);
        $this->assertSame(0, QbQuestion::where('question_text', 'অপশনহীন MCQ')->count());
        $this->artisan('qb:import-from-qbank', ['--media-path' => $this->media])
            ->expectsOutputToContain('its subject was not imported')                  // chapter 31 hangs on a subject that is not there
            ->expectsOutputToContain('no question text')
            ->expectsOutputToContain('a nested part')
            ->expectsOutputToContain('has structured parts')
            ->expectsOutputToContain('the file is not in --media-path')
            ->assertSuccessful();
    }

    public function test_curriculum_already_here_is_matched_by_name_not_copied(): void
    {
        $level = QbClassLevel::create(['name_bn' => 'নবম', 'name_en' => 'Class 9', 'education_level' => 'secondary']);   // the seed came from qbank
        $subject = QbSubject::create(['name_bn' => 'পদার্থ', 'name_en' => 'Physics']);
        \Illuminate\Support\Facades\Artisan::call('qb:import-from-qbank', ['--media-path' => $this->media]);
        $this->assertMatchesRegularExpression('/class_levels\s*\|\s*0\s*\|\s*1\s*\|/', \Illuminate\Support\Facades\Artisan::output(), 'reported as matched, not new');
        $this->assertSame([1, 1], [QbClassLevel::count(), QbSubject::count()]);
        $this->assertSame([$level->id, $subject->id], [QbImportMap::where('source_table', 'class_levels')->value('target_id'), QbImportMap::where('source_table', 'subjects')->value('target_id')]);
        $this->assertSame($subject->id, QbQuestion::where('question_text', 'বেগের একক?')->value('qb_subject_id'));
    }

    public function test_qbank_editor_html_arrives_as_plain_text_and_refresh_text_cleans_earlier_rows(): void
    {
        $html = '<div data-qae-layout="qa"><div data-qae-slot="task"><div dir="auto">বল&#160;কাকে বলে?</div></div><ol><li>এক</li><li>দুই</li></ol></div>\n<script>x</script>শেষ';
        $this->assertSame("বল কাকে বলে?\nএক\nদুই\nxশেষ", \App\Console\Commands\QbImportFromQbank::plain($html));
        $this->assertSame('----nt -> (a)___', \App\Console\Commands\QbImportFromQbank::plain('[[qmx-image:7]] ----nt -> (a)___'));
        DB::connection('qbank')->table('questions')->where('id', 100)->update(['question_text' => '<div>বেগের&#160;একক?</div>']);
        $this->artisan('qb:import-from-qbank', ['--media-path' => $this->media])->assertSuccessful();
        $q = QbQuestion::where('question_text', 'বেগের একক?')->firstOrFail();
        $q->forceFill(['question_text' => '<div dir="auto">পুরনো&#160;HTML</div>\n'])->save();   // as the first, uncleaned run left it
        $this->artisan('qb:import-from-qbank', ['--media-path' => $this->media, '--refresh-text' => true])->assertSuccessful();
        $this->assertSame('পুরনো HTML', $q->fresh()->question_text);
    }

    public function test_structured_questions_arrive_in_the_existing_stimuli_and_items_d70_d71(): void
    {
        $s = Schema::connection('qbank');
        $s->table('question_items', fn (Blueprint $t) => [$t->text('prompt_text')->nullable(), $t->text('answer_text')->nullable(), $t->decimal('marks', 8, 2)->nullable(), $t->integer('sort_order')->default(0)]);
        $s->table('question_stimuli', fn (Blueprint $t) => [$t->string('title')->nullable(), $t->string('stimulus_type')->nullable(), $t->text('content_json')->nullable()]);
        $s->create('question_item_options', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('question_item_id'), $t->text('option_text')->nullable(), $t->boolean('is_correct')->default(false), $t->integer('sort_order')->default(0)]);
        $s->create('question_interactions', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('question_id'), $t->string('interaction_type'), $t->text('definition_json')]);
        $s->create('question_interaction_entities', fn (Blueprint $t) => [$t->id(), $t->unsignedBigInteger('question_interaction_id'), $t->string('entity_type'), $t->string('logical_key'), $t->unsignedBigInteger('question_item_id')->nullable()]);
        $q = DB::connection('qbank');
        $q->table('question_types')->insert(['id' => 3, 'slug' => 'structured', 'name_bn' => 'স', 'name_en' => 's']);
        $add = fn (int $id, string $text, ?int $stim = null) => $q->table('questions')->insert(['id' => $id, 'question_type_id' => 3, 'subject_id' => 20, 'question_text' => $text, 'question_stimulus_id' => $stim]);
        // a passage with one MCQ item and one written item (question 103 already points at stimulus 7; its empty item gets content)
        $q->table('question_stimuli')->where('id', 7)->update(['title' => 'অনুচ্ছেদ', 'content_text' => '<p>Rana went&#160;home.</p>']);
        $q->table('question_items')->where('question_id', 103)->update(['prompt_text' => 'Who went?', 'sort_order' => 1]);
        $item = $q->table('question_items')->where('question_id', 103)->value('id');
        $q->table('question_item_options')->insert([['question_item_id' => $item, 'option_text' => 'Rana', 'is_correct' => true, 'sort_order' => 1], ['question_item_id' => $item, 'option_text' => 'Rina', 'is_correct' => false, 'sort_order' => 2]]);
        $q->table('question_items')->insert(['question_id' => 103, 'prompt_text' => 'Where?', 'answer_text' => 'home', 'sort_order' => 2]);
        $q->table('question_options')->insert([['question_id' => 103, 'option_label' => 'ক', 'option_text' => 'a', 'is_correct' => true, 'sort_order' => 1], ['question_id' => 103, 'option_label' => 'খ', 'option_text' => 'b', 'is_correct' => false, 'sort_order' => 2]]);
        // fill gap with clues: two gaps, the second with an alias; the projection items carry the text around each gap
        $add(110, 'Fill in');
        $g1 = $q->table('question_items')->insertGetId(['question_id' => 110, 'prompt_text' => 'He (a) ___ to']);
        $g2 = $q->table('question_items')->insertGetId(['question_id' => 110, 'prompt_text' => '(b) ___ at nine']);
        $i1 = $q->table('question_interactions')->insertGetId(['question_id' => 110, 'interaction_type' => 'fill_gap_with_clue', 'definition_json' => json_encode(['type' => 'fill_gap_with_clue',
            'content' => ['clues' => ['c1' => 'went', 'c2' => ['text' => 'school']]], 'presentation' => ['entity_order' => ['g1', 'g2', 'c1', 'c2']],
            'answer_key' => ['gaps' => ['g2' => ['primary' => 'school', 'aliases' => ['School']], 'g1' => ['primary' => 'went']]], 'scoring' => ['gaps' => ['g1' => ['marks' => 1], 'g2' => ['marks' => 1]]]])]);
        $q->table('question_interaction_entities')->insert([['question_interaction_id' => $i1, 'entity_type' => 'GAP', 'logical_key' => 'g1', 'question_item_id' => $g1], ['question_interaction_id' => $i1, 'entity_type' => 'GAP', 'logical_key' => 'g2', 'question_item_id' => $g2]]);
        // rearranging: the right order differs from the items' order
        $add(111, 'Arrange');
        $sa = $q->table('question_items')->insertGetId(['question_id' => 111, 'prompt_text' => 'go to school']);
        $sb = $q->table('question_items')->insertGetId(['question_id' => 111, 'prompt_text' => 'wake up']);
        $i2 = $q->table('question_interactions')->insertGetId(['question_id' => 111, 'interaction_type' => 'rearranging', 'definition_json' => json_encode(['type' => 'rearranging', 'answer_key' => ['correct_order' => ['s2', 's1']]])]);
        $q->table('question_interaction_entities')->insert([['question_interaction_id' => $i2, 'entity_type' => 'SEGMENT', 'logical_key' => 's1', 'question_item_id' => $sa], ['question_interaction_id' => $i2, 'entity_type' => 'SEGMENT', 'logical_key' => 's2', 'question_item_id' => $sb]]);
        // matching (two sides) and a table (no shape here - the whole question waits)
        $add(112, 'Match');
        $q->table('question_interactions')->insert(['question_id' => 112, 'interaction_type' => 'matching', 'definition_json' => json_encode(['type' => 'matching',
            'content' => ['matching' => ['left' => [['key' => 'l1', 'text' => 'Dhaka'], ['key' => 'l2', 'text' => 'Delhi']], 'right' => [['key' => 'r1', 'text' => 'India'], ['key' => 'r2', 'text' => 'Bangladesh']]]],
            'answer_key' => ['matches' => ['l1' => 'r2', 'l2' => ['r1']]]])]);
        // D71: a table (one answer cell), column matching (3 columns), an item without an answer; and an unknown interaction still waits
        $add(113, 'Table');
        $q->table('question_interactions')->insert(['question_id' => 113, 'interaction_type' => 'table_completion', 'definition_json' => json_encode(['type' => 'table_completion',
            'content' => ['table' => ['columns' => [['header' => 'Verb'], ['header' => 'Past']], 'rows' => [['cells' => [['kind' => 'fixed', 'text' => 'go'], ['kind' => 'answerable', 'cell_key' => 'k1']]]]]],
            'answer_key' => ['cells' => ['k1' => ['answer_kind' => 'text', 'primary' => 'went']]]])]);
        $add(114, 'Columns');
        $q->table('question_interactions')->insert(['question_id' => 114, 'interaction_type' => 'matching', 'definition_json' => json_encode(['type' => 'matching',
            'content' => ['matching' => ['columns' => [['options' => [['key' => 'a', 'text' => 'Dhaka'], ['key' => 'b', 'text' => 'Delhi']]],
                ['options' => [['key' => 'x', 'text' => 'India'], ['key' => 'y', 'text' => 'Bangladesh']]], ['options' => [['key' => 'm', 'text' => 'Rupee'], ['key' => 'n', 'text' => 'Taka']]]]]],
            'answer_key' => ['matches' => ['a' => ['y', 'n'], 'b' => ['x', 'm']]]])]);
        $add(115, 'No answer', null);
        $q->table('question_items')->insert(['question_id' => 115, 'prompt_text' => 'Why?']);
        $add(116, 'Odd');
        $q->table('question_interactions')->insert(['question_id' => 116, 'interaction_type' => 'hotspot', 'definition_json' => json_encode(['type' => 'hotspot'])]);

        $items = fn (string $text) => QbQuestionItem::where('qb_question_id', QbQuestion::where('question_text', $text)->value('id'))->orderBy('sort_order')->get();
        \Illuminate\Support\Facades\Artisan::call('qb:import-from-qbank', ['--media-path' => $this->media]);
        $report = \Illuminate\Support\Facades\Artisan::output();
        $this->assertStringContainsString('has structured parts that do not fit (interaction hotspot)', $report);
        $this->assertStringContainsString('imported without an answer', $report);
        $this->assertSame(0, QbQuestion::where('question_text', 'Odd')->count());
        $table = QbQuestionStimulus::where('qb_question_id', QbQuestion::where('question_text', 'Table')->value('id'))->firstOrFail();
        $this->assertSame(['table', "Verb | Past\ngo | (1) ___"], [$table->label, $table->content_text]);
        $this->assertStringNotContainsString('went', json_encode($table->content_json), 'the stimulus never carries the answers');
        $this->assertSame([['gap', '(1) go — Past', ['went'], $table->id]], $items('Table')->map(fn ($i) => [$i->item_type, $i->prompt_text, $i->answer_json['answers'], $i->qb_question_stimulus_id])->all());
        $this->assertSame([['Dhaka', 'Bangladesh — Taka'], ['Delhi', 'India — Rupee']], $items('Columns')->map(fn ($i) => [$i->prompt_text, $i->answer_json['right']])->all());
        $this->assertSame([['sub_question', 'Why?', null]], $items('No answer')->map(fn ($i) => [$i->item_type, $i->prompt_text, $i->answer_json['answer_text']])->all());
        $this->assertSame('review', QbQuestion::where('question_text', 'No answer')->value('status'));

        $passage = QbQuestion::where('question_text', 'অনুচ্ছেদ পড়ে উত্তর দাও')->firstOrFail();
        $st = QbQuestionStimulus::where('qb_question_id', $passage->id)->firstOrFail();
        $this->assertSame(['অনুচ্ছেদ', 'Rana went home.'], [$st->label, $st->content_text]);
        $this->assertSame([['sub_mcq', 'Who went?', ['options' => ['Rana', 'Rina']], ['correct' => 0], $st->id], ['sub_question', 'Where?', null, ['answer_text' => 'home'], $st->id]],
            $items('অনুচ্ছেদ পড়ে উত্তর দাও')->map(fn ($i) => [$i->item_type, $i->prompt_text, $i->prompt_json, $i->answer_json, $i->qb_question_stimulus_id])->all());

        $this->assertSame([['He (a) ___ to', ['went']], ['(b) ___ at nine', ['school', 'School']]], $items('Fill in')->map(fn ($i) => [$i->prompt_text, $i->answer_json['answers']])->all());
        $this->assertSame(['gap', 'gap'], $items('Fill in')->pluck('item_type')->all());
        $this->assertSame('went / school', QbQuestionStimulus::where('qb_question_id', QbQuestion::where('question_text', 'Fill in')->value('id'))->value('content_text'));
        $this->assertSame([['wake up', 1], ['go to school', 2]], $items('Arrange')->map(fn ($i) => [$i->prompt_text, $i->answer_json['position']])->all());
        $this->assertSame([['match_pair', 'Dhaka', 'Bangladesh'], ['match_pair', 'Delhi', 'India']], $items('Match')->map(fn ($i) => [$i->item_type, $i->prompt_text, $i->answer_json['right']])->all());

        $before = [QbQuestionItem::count(), QbQuestionStimulus::count()];
        $this->artisan('qb:import-from-qbank', ['--media-path' => $this->media])->assertSuccessful();
        $this->assertSame($before, [QbQuestionItem::count(), QbQuestionStimulus::count()], 'a second run adds no parts twice');
    }

    public function test_a_passage_kept_in_the_question_text_becomes_the_passage(): void
    {
        QbQuestionType::create(['slug' => 'seen_passage', 'name_bn' => 'সিন প্যাসেজ', 'name_en' => 'Seen passage', 'family' => 'other', 'ui_config' => ['structure' => 'passage']]);
        Schema::connection('qbank')->table('question_items', fn (Blueprint $t) => [$t->text('prompt_text')->nullable(), $t->text('answer_text')->nullable(), $t->integer('sort_order')->default(0)]);
        $q = DB::connection('qbank');
        $q->table('question_types')->insert(['id' => 4, 'slug' => 'seen_passage', 'name_bn' => 'x', 'name_en' => 'x']);
        $q->table('questions')->insert(['id' => 120, 'question_type_id' => 4, 'subject_id' => 20, 'question_text' => 'Behula is a legendary heroine.', 'language' => 'en']);
        $q->table('question_items')->insert([['question_id' => 120, 'prompt_text' => 'Who is Behula?', 'answer_text' => 'A heroine', 'sort_order' => 1]]);
        $this->artisan('qb:import-from-qbank', ['--media-path' => $this->media])->assertSuccessful();

        $question = QbQuestion::where('qb_question_type_id', QbQuestionType::where('slug', 'seen_passage')->value('id'))->firstOrFail();
        $st = QbQuestionStimulus::where('qb_question_id', $question->id)->firstOrFail();
        $this->assertSame(['Seen passage', 'Behula is a legendary heroine.'], [$question->question_text, $st->content_text]);
        $this->assertSame([$st->id], QbQuestionItem::where('qb_question_id', $question->id)->pluck('qb_question_stimulus_id')->all());

        // a row imported before this repair (passage still in the text): --refresh-text moves it, once
        QbQuestionItem::where('qb_question_id', $question->id)->update(['qb_question_stimulus_id' => null]);
        $st->delete();
        $question->forceFill(['question_text' => 'Behula is a legendary heroine.'])->save();
        $this->artisan('qb:import-from-qbank', ['--media-path' => $this->media, '--refresh-text' => true])->assertSuccessful();
        $this->artisan('qb:import-from-qbank', ['--media-path' => $this->media, '--refresh-text' => true])->assertSuccessful();
        $this->assertSame(['Seen passage', 1], [$question->fresh()->question_text, QbQuestionStimulus::where('qb_question_id', $question->id)->count()]);
        $this->assertSame('Behula is a legendary heroine.', QbQuestionStimulus::where('qb_question_id', $question->id)->value('content_text'));
    }
}
