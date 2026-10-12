<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbChapter, QbClassLevel, QbCreativePart, QbImportMap, QbMedia, QbMediaLink, QbQuestion, QbQuestionClassLevel, QbQuestionOccurrence, QbQuestionOption,
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
}
