<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{AuditLog, QbCurriculumNode, QbCurriculumVersion, QbImportBatch, QbImportRecord, QbQuestion, QbQuestionType, QbSubject, User};
use App\Services\QbImportService;
use App\Support\Tenancy;
use App\Support\Toon\ToonEncoder;
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// D123 (R2.1.3): upload -> staged records with exact counts; the same upload reopens its batch; JSON and TOON stage the same;
// a broken file or unsupported version fails visibly; chunks re-run without doubling and a stalled batch resumes; the error
// report names file, record and field path; only the batch's writer (and the Super Admin) can see it.
class QbJsonToonImportTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $writer;
    private int $subject;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->seed(QbQuestionTypeSeeder::class);
        $this->writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Mathematics'])->id;
        QbQuestion::create(['qb_question_type_id' => QbQuestionType::where('slug', 'short')->value('id'), 'qb_subject_id' => $this->subject,
            'question_text' => 'What is 2 + 2?', 'language' => 'en', 'status' => 'published', 'created_by' => $this->writer->id]);
    }

    private function questions(): array
    {
        return ['schema_version' => QbImportService::SCHEMA_V5, 'document' => ['language' => 'en'], 'questions' => [
            ['question_type' => 'mcq', 'question_text' => 'If \(x^2 = 4\), x = ?', 'settings' => ['subject' => ['name' => 'Mathematics']],
                'options' => [['label' => 'A', 'text' => '2', 'is_correct' => true], ['label' => 'B', 'text' => '3', 'is_correct' => false]]],
            ['question_type' => 'riddle', 'question_text' => 'What has keys?', 'settings' => ['subject' => ['name' => 'Mathematics']]],
            ['question_type' => 'short', 'question_text' => 'what is 2+2', 'settings' => ['subject' => ['name' => 'গণিত']]],
        ]];
    }

    private function upload(User $user, string $name, string $bytes)
    {
        return $this->api('POST', $this->central, 'writer/imports', $user, ['files' => [UploadedFile::fake()->createWithContent($name, $bytes)]]);
    }

    public function test_a_json_upload_is_staged_with_exact_counts_and_reused_on_repeat(): void
    {
        $json = json_encode($this->questions(), JSON_UNESCAPED_UNICODE);
        $made = $this->upload($this->writer, 'q.json', $json)->assertCreated()->json('data');
        $show = $this->api('GET', $this->central, "writer/imports/{$made['id']}", $this->writer)->assertOk()->json('data');
        $this->assertSame(['status' => 'ready', 'total' => 3, 'parsed' => 3, 'valid' => 2, 'invalid' => 1, 'duplicate' => 1, 'imported' => 0],
            ['status' => $show['status']] + $show['counts']);
        $this->assertSame(0, QbQuestion::where('question_text', 'like', 'If %')->count(), 'nothing enters the bank before "import selected"');

        $bad = $this->api('GET', $this->central, "writer/imports/{$made['id']}/records?filter=invalid", $this->writer)->assertOk()->json('data');
        $this->assertSame([2, 'question_type'], [$bad[0]['record'], $bad[0]['errors'][0]['path']]);
        $dupe = $this->api('GET', $this->central, "writer/imports/{$made['id']}/records?filter=duplicate", $this->writer)->json('data');
        $this->assertSame([3, 'possible'], [$dupe[0]['record'], $dupe[0]['duplicate_status']]);
        $valid = $this->api('GET', $this->central, "writer/imports/{$made['id']}/records?filter=valid", $this->writer)->json('data');
        $this->assertSame('If \(x^2 = 4\), x = ?', $valid[0]['payload']['question_text'], 'LaTeX exactly as uploaded');

        $csv = $this->api('GET', $this->central, "writer/imports/{$made['id']}/errors.csv", $this->writer)->assertOk()->getContent();
        $this->assertStringContainsString('q.json,2,,question_type,', $csv);

        $again = $this->upload($this->writer, 'q.json', $json)->assertOk();
        $this->assertSame([$made['id'], true], [$again->json('data.id'), $again->json('reused')]);
        $this->assertSame(1, QbImportBatch::count());
    }

    public function test_toon_text_stages_the_same_records_as_json(): void
    {
        $json = $this->upload($this->writer, 'q.json', json_encode($this->questions(), JSON_UNESCAPED_UNICODE))->json('data.id');
        $toon = $this->api('POST', $this->central, 'writer/imports', $this->writer, ['text' => ToonEncoder::encode($this->questions()), 'format' => 'toon'])
            ->assertCreated()->json('data');
        $this->assertSame('toon', $toon['format']);
        $records = fn ($uuid) => QbImportRecord::whereHas('batch', fn ($q) => $q->where('uuid', $uuid))->orderBy('record_index')->get(['type_slug', 'payload', 'errors', 'duplicate_status'])->toArray();
        $this->assertSame($records($json), $records($toon['id']));
    }

    public function test_broken_files_fail_visibly(): void
    {
        $this->assertSame('failed', $this->upload($this->writer, 'bad.json', '{"questions": [')->json('data.status'));
        $failed = $this->upload($this->writer, 'bad.toon', "questions[2]:\n  - a: 1")->json('data');
        $this->assertSame('failed', $failed['status']);
        $this->assertStringContainsString('line 1', $failed['error']);
        $this->assertStringContainsString('unsupported schema_version', $this->upload($this->writer, 'v.json', '{"schema_version":"other.v9","questions":[]}')->json('data.error'));
        config(['qb_import.max_records' => 2]);
        $this->assertStringContainsString('more than 2', $this->upload($this->writer, 'many.json', json_encode($this->questions()))->json('data.error'));
    }

    public function test_chunks_rerun_without_doubling_and_a_stalled_batch_resumes(): void
    {
        config(['qb_import.chunk' => 2]);
        $uuid = $this->upload($this->writer, 'q.json', json_encode($this->questions()))->json('data.id');
        $batch = QbImportBatch::where('uuid', $uuid)->first();
        $svc = app(QbImportService::class);
        $svc->parseChunk($batch, 0, 0);
        $svc->parseChunk($batch, 0, 2);
        $this->assertSame(3, QbImportRecord::count(), 'a re-run chunk adds nothing');

        QbImportRecord::where('record_index', 2)->delete();                  // a worker died before the last chunk
        $batch->update(['status' => 'parsing']);
        $svc->recount($batch->fresh());
        $this->assertSame('parsing', $batch->fresh()->status);
        $this->api('POST', $this->central, "writer/imports/{$uuid}/resume", $this->writer)->assertOk()->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.counts.parsed', 3);
    }

    public function test_import_batches_are_listed_by_creation_time_newest_first(): void
    {
        $firstQuestions = $this->questions();
        $firstQuestions['document']['title'] = 'first';
        $first = $this->upload($this->writer, 'first.json', json_encode($firstQuestions, JSON_UNESCAPED_UNICODE))->assertCreated()->json('data');

        $secondQuestions = $this->questions();
        $secondQuestions['document']['title'] = 'second';
        $second = $this->upload($this->writer, 'second.json', json_encode($secondQuestions, JSON_UNESCAPED_UNICODE))->assertCreated()->json('data');

        $firstBatch = QbImportBatch::where('uuid', $first['id'])->firstOrFail();
        $firstBatch->created_at = now()->addMinute();
        $firstBatch->saveQuietly();

        $rows = $this->api('GET', $this->central, 'writer/imports', $this->writer)->assertOk()->json('data');

        $this->assertSame([$first['id'], $second['id']], array_column($rows, 'id'));
        $this->assertGreaterThan($rows[1]['created_at'], $rows[0]['created_at']);
    }

    public function test_only_the_owner_and_the_super_admin_see_a_batch(): void
    {
        $uuid = $this->upload($this->writer, 'q.json', json_encode($this->questions()))->json('data.id');
        $other = User::create(['institution_id' => null, 'name' => 'o', 'role' => 'content_writer', 'phone' => '01833333333', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $mod = User::create(['institution_id' => null, 'name' => 'm', 'role' => 'content_moderator', 'phone' => '01822222222', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $super = User::where('role', 'super_admin')->first() ?? User::create(['institution_id' => null, 'name' => 's', 'role' => 'super_admin', 'phone' => '01700000001', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $this->api('GET', $this->central, "writer/imports/{$uuid}", $other)->assertNotFound();
        $this->assertSame([], $this->api('GET', $this->central, 'writer/imports', $other)->json('data'));
        $this->api('GET', $this->central, "writer/imports/{$uuid}", $mod)->assertForbidden();
        $this->api('GET', $this->central, "writer/imports/{$uuid}", $super)->assertOk();
    }

    public function test_d150_bulk_source_attribution_is_additive_idempotent_and_round_trips(): void
    {
        $questions = $this->questions();
        $existing = ['note' => 'board', 'institution_name' => 'Dhaka Board', 'board' => 'DB', 'exam_type' => 'SSC', 'year' => 2025,
            'question_number' => '12', 'set_label' => 'A', 'page_reference' => 'p. 8'];
        $questions['questions'][0]['occurrences'] = [$existing];
        $uuid = $this->upload($this->writer, 'q.json', json_encode($questions, JSON_UNESCAPED_UNICODE))->json('data.id');
        $record = QbImportRecord::where('record_index', 0)->firstOrFail();
        $this->assertSame([$existing], $record->payload['occurrences']);

        $this->api('POST', $this->central, "writer/imports/{$uuid}/select", $this->writer, ['record_ids' => [$record->id], 'selected' => true])->assertOk();
        $source = ['note' => 'school', 'institution_name' => 'North High School', 'board' => 'NHS', 'exam_type' => 'Final', 'year' => 2026,
            'question_number' => '4(b)', 'set_label' => 'B', 'page_reference' => 'p. 19'];
        $apply = fn () => $this->api('POST', $this->central, "writer/imports/{$uuid}/settings", $this->writer,
            ['selected' => true, 'changes' => ['source_occurrence' => $source]])->assertOk();
        $apply();
        $apply();
        $record->refresh();
        $this->assertSame([$existing, $source], $record->payload['occurrences']);
        $this->api('PATCH', $this->central, "writer/imports/{$uuid}/records/{$record->id}", $this->writer, ['question_text' => 'Edited after source apply'])->assertOk();
        $record->refresh();
        $this->assertSame([$existing, $source], $record->payload['occurrences'], 'quick edit preserves source history');

        $result = $this->api('POST', $this->central, "writer/imports/{$uuid}/finalize", $this->writer)->assertOk()->json('result');
        $this->assertSame(1, $result['imported']);
        $question = QbQuestion::findOrFail($record->fresh()->qb_question_id);
        $this->assertSame([$existing, $source], $question->occurrences()->get()->map(fn ($row) => $row->only([
            'note', 'institution_name', 'board', 'exam_type', 'year', 'question_number', 'set_label', 'page_reference',
        ]))->all());
    }

    public function test_d153_opens_one_valid_staged_record_in_the_full_editor_without_finalizing_other_rows(): void
    {
        $questions = $this->questions();
        $questions['questions'][0]['answer_text'] = 'The answer is 2.';
        $questions['questions'][0]['explanation_text'] = 'Because x squared equals 4.';
        $uuid = $this->upload($this->writer, 'editor-bridge.json', json_encode($questions, JSON_UNESCAPED_UNICODE))->json('data.id');
        $records = QbImportRecord::whereHas('batch', fn ($q) => $q->where('uuid', $uuid))->orderBy('record_index')->get();
        $valid = $records[0];

        $first = $this->api('POST', $this->central, "writer/imports/{$uuid}/records/{$valid->id}/open-editor", $this->writer)
            ->assertOk()->json('data');
        $questionId = $first['question_id'];
        $this->assertSame($questionId, $first['record']['qb_question_id']);
        $question = QbQuestion::findOrFail($questionId);
        $this->assertSame(['draft', $this->writer->id], [$question->status, $question->created_by]);
        $this->assertSame('The answer is 2.', $question->answer_text);
        $this->assertSame('Because x squared equals 4.', $question->explanation_text);
        $this->assertTrue((bool) $question->options()->where('label', 'A')->value('is_correct'));

        $again = $this->api('POST', $this->central, "writer/imports/{$uuid}/records/{$valid->id}/open-editor", $this->writer)->assertOk();
        $this->assertSame($questionId, $again->json('data.question_id'));
        $this->assertSame(2, QbQuestion::count(), 'reopening reuses the same draft');
        $this->assertNull($records[1]->fresh()->qb_question_id, 'the invalid row stays staged');
        $this->assertNull($records[2]->fresh()->qb_question_id, 'the possible duplicate stays staged');
        $this->api('GET', $this->central, "writer/questions/{$questionId}", $this->writer)->assertOk()
            ->assertJsonPath('data.answer_text', 'The answer is 2.')
            ->assertJsonPath('data.explanation_text', 'Because x squared equals 4.')
            ->assertJsonPath('data.options.0.is_correct', true);

        $this->api('POST', $this->central, "writer/imports/{$uuid}/records/{$records[1]->id}/open-editor", $this->writer)->assertUnprocessable();
        $this->api('POST', $this->central, "writer/imports/{$uuid}/records/{$records[2]->id}/open-editor", $this->writer)->assertUnprocessable();
        $this->api('POST', $this->central, "writer/imports/{$uuid}/records/{$records[2]->id}/duplicate", $this->writer, ['choice' => 'skip'])->assertOk();
        $this->api('POST', $this->central, "writer/imports/{$uuid}/records/{$records[2]->id}/open-editor", $this->writer)->assertUnprocessable();
        $this->assertSame(2, QbQuestion::count());
    }

    public function test_language_paper_curriculum_node_ids_round_trip_from_json_and_toon_to_draft_questions(): void
    {
        $subjects = [];
        $nodes = [];
        foreach ([['বাংলা ১ম পত্র', 'Bangla 1st Paper', 'bn'], ['ইংরেজি ১ম পত্র', 'English 1st Paper', 'en']] as [$nameBn, $nameEn, $language]) {
            $subject = QbSubject::create(['name_bn' => $nameBn, 'name_en' => $nameEn]);
            $version = QbCurriculumVersion::create(['qb_subject_id' => $subject->id, 'version_key' => $language . '-paper-v1', 'name_bn' => $nameBn, 'name_en' => $nameEn]);
            $node = QbCurriculumNode::create(['qb_curriculum_version_id' => $version->id, 'kind' => 'Unit', 'name_bn' => $nameBn . ' ইউনিট', 'name_en' => $nameEn . ' Unit']);
            $subjects[] = [$subject, $language];
            $nodes[] = $node;
        }
        $questions = ['schema_version' => QbImportService::SCHEMA_V5, 'questions' => []];
        $questionTexts = [];
        foreach ($subjects as $i => [$subject, $language]) {
            $questionTexts[$i] = $language === 'bn' ? "বাংলা প্রশ্ন {$i}" : "English question {$i}";
            $questions['questions'][] = ['question_type' => 'short', 'question_text' => $questionTexts[$i], 'language' => $language,
                'settings' => ['subject' => ['id' => $subject->id]], 'curriculum_node_ids' => [$nodes[$i]->id]];
        }
        $uuid = $this->upload($this->writer, 'language.json', json_encode($questions, JSON_UNESCAPED_UNICODE))->assertCreated()->json('data.id');
        $toonQuestions = $questions;
        foreach ($toonQuestions['questions'] as $i => &$question) $question['question_text'] .= ' (TOON)';
        unset($question);
        $toonUuid = $this->api('POST', $this->central, 'writer/imports', $this->writer,
            ['text' => ToonEncoder::encode($toonQuestions), 'format' => 'toon'])->assertCreated()->json('data.id');
        $records = QbImportRecord::whereHas('batch', fn ($query) => $query->where('uuid', $uuid))->orderBy('record_index')->get();
        $this->assertCount(2, $records);
        foreach ($records as $i => $record) {
            $this->assertSame([], $record->errors ?? []);
            $this->assertSame([$nodes[$i]->id], $record->payload['curriculum_node_ids']);
        }
        $toonRecords = QbImportRecord::whereHas('batch', fn ($query) => $query->where('uuid', $toonUuid))->orderBy('record_index')->get();
        foreach ($toonRecords as $i => $record) $this->assertSame([$nodes[$i]->id], $record->payload['curriculum_node_ids']);

        $editRecord = $records[0];
        $this->api('PATCH', $this->central, "writer/imports/{$uuid}/records/{$editRecord->id}", $this->writer,
            ['curriculum_node_ids' => [$nodes[1]->id]])->assertOk();
        $editRecord->refresh();
        $this->assertContains('curriculum_node_ids.0', array_column($editRecord->errors, 'path'));
        $this->api('PATCH', $this->central, "writer/imports/{$uuid}/records/{$editRecord->id}", $this->writer,
            ['curriculum_node_ids' => [$nodes[0]->id]])->assertOk();
        $editRecord->refresh();
        $this->assertSame([], $editRecord->errors ?? []);
        $this->assertSame([$nodes[0]->id], $editRecord->payload['curriculum_node_ids']);

        $this->api('POST', $this->central, "writer/imports/{$uuid}/select", $this->writer,
            ['record_ids' => $records->pluck('id')->all(), 'selected' => true])->assertOk();
        $this->api('POST', $this->central, "writer/imports/{$uuid}/finalize", $this->writer)->assertOk()->assertJsonPath('result.imported', 2);
        $this->api('POST', $this->central, "writer/imports/{$toonUuid}/select", $this->writer,
            ['record_ids' => $toonRecords->pluck('id')->all(), 'selected' => true])->assertOk();
        $this->api('POST', $this->central, "writer/imports/{$toonUuid}/finalize", $this->writer)->assertOk()->assertJsonPath('result.imported', 2);
        foreach ($subjects as $i => [$subject, $language]) {
            $saved = QbQuestion::where('question_text', $questionTexts[$i])->firstOrFail();
            $this->assertSame([$nodes[$i]->id], $saved->curriculumNodes()->pluck('qb_curriculum_nodes.id')->all());
            $this->assertSame(['review', $this->writer->id], [$saved->status, $saved->created_by], 'multi-select import submits each question for moderation');
            $this->assertTrue(Tenancy::withoutTenancy(fn () => AuditLog::query()->where('action', 'qb.import.submitted')->where('model', 'QbQuestion')->where('model_id', $saved->id)->exists()));
            $this->api('GET', $this->central, "writer/questions/{$saved->id}", $this->writer)->assertOk()
                ->assertJsonPath('data.curriculum_node_ids.0', $nodes[$i]->id);
            $toonSaved = QbQuestion::where('question_text', $questionTexts[$i] . ' (TOON)')->firstOrFail();
            $this->assertSame([$nodes[$i]->id], $toonSaved->curriculumNodes()->pluck('qb_curriculum_nodes.id')->all());
            $this->api('GET', $this->central, "writer/questions/{$toonSaved->id}", $this->writer)->assertOk()
                ->assertJsonPath('data.curriculum_node_ids.0', $nodes[$i]->id);
        }
        $schemaNodeIds = $this->api('GET', $this->central, 'writer/imports/schema.json', $this->writer)->assertOk()->json()
            ['$defs']['question']['properties']['curriculum_node_ids'];
        $this->assertSame('array', $schemaNodeIds['type']);
        $this->assertSame('integer', $schemaNodeIds['items']['type']);
    }

    public function test_d150_toon_occurrences_keep_all_fields_through_editor(): void
    {
        $questions = $this->questions();
        $occurrence = ['note' => 'board', 'institution_name' => 'Dhaka Board', 'board' => 'DB', 'exam_type' => 'SSC', 'year' => 2025,
            'question_number' => '12', 'set_label' => 'A', 'page_reference' => 'p. 8'];
        $questions['questions'][0]['occurrences'] = [$occurrence];
        $batch = $this->api('POST', $this->central, 'writer/imports', $this->writer,
            ['text' => ToonEncoder::encode($questions), 'format' => 'toon'])->assertCreated()->json('data');
        $record = QbImportRecord::where('record_index', 0)->firstOrFail();
        $this->assertSame([$occurrence], $record->payload['occurrences']);

        $this->api('POST', $this->central, "writer/imports/{$batch['id']}/select", $this->writer,
            ['record_ids' => [$record->id], 'selected' => true])->assertOk();
        $this->api('POST', $this->central, "writer/imports/{$batch['id']}/finalize", $this->writer)->assertOk();
        $question = $this->api('GET', $this->central, 'writer/questions/' . $record->fresh()->qb_question_id, $this->writer)->assertOk()->json('data');
        $this->assertEquals([$occurrence], $question['occurrences']);
    }

    public function test_d150_invalid_source_stays_visible_and_does_not_change_unselected_records(): void
    {
        $uuid = $this->upload($this->writer, 'q.json', json_encode($this->questions(), JSON_UNESCAPED_UNICODE))->json('data.id');
        $selected = QbImportRecord::where('record_index', 0)->firstOrFail();
        $unselected = QbImportRecord::where('record_index', 2)->firstOrFail();
        $this->api('POST', $this->central, "writer/imports/{$uuid}/select", $this->writer,
            ['record_ids' => [$selected->id], 'selected' => true])->assertOk();

        $response = $this->api('POST', $this->central, "writer/imports/{$uuid}/settings", $this->writer, [
            'record_ids' => [$selected->id, $unselected->id], 'changes' => ['source_occurrence' => [
                'note' => 'not-a-source-type', 'institution_name' => 'Bad source', 'board' => 'BAD', 'exam_type' => 'SSC', 'year' => 1800,
                'question_number' => '1', 'set_label' => 'A', 'page_reference' => 'p. 2',
            ]],
        ])->assertOk()->assertJsonPath('changed', 1);
        $selected->refresh();
        $unselected->refresh();
        $this->assertSame(['occurrences.0.note', 'occurrences.0.year'], array_column($selected->errors, 'path'));
        $this->assertSame('not-a-source-type', $selected->payload['occurrences'][0]['note']);
        $this->api('PATCH', $this->central, "writer/imports/{$uuid}/records/{$selected->id}", $this->writer,
            ['question_text' => 'Edited while reviewing'])->assertOk()->assertJsonPath('data.errors.0.path', 'occurrences.0.note');
        $selected->refresh();
        $this->assertSame('not-a-source-type', $selected->payload['occurrences'][0]['note']);
        $this->assertSame([], $unselected->payload['occurrences']);
        $this->assertNull($unselected->errors);
    }

    public function test_review_quick_edit_bulk_settings_duplicates_and_import_selected(): void
    {
        $data = $this->questions();
        $data['questions'][] = ['question_type' => 'short', 'question_text' => 'Name a prime number.', 'answer_text' => '2'];   // no subject yet
        $uuid = $this->upload($this->writer, 'q.json', json_encode($data, JSON_UNESCAPED_UNICODE))->json('data.id');
        $rows = collect($this->api('GET', $this->central, "writer/imports/{$uuid}/records", $this->writer)->json('data'))->keyBy('record');
        [$mcq, $riddle, $dupe, $noSubject] = [$rows[1]['id'], $rows[2]['id'], $rows[3]['id'], $rows[4]['id']];
        $this->assertSame('subject', $rows[4]['errors'][0]['path']);

        // quick edit: the unknown type becomes a real one; a bad subject is an error again
        $this->api('PATCH', $this->central, "writer/imports/{$uuid}/records/{$riddle}", $this->writer, ['type' => 'short'])->assertOk()->assertJsonPath('data.errors', []);
        $this->api('PATCH', $this->central, "writer/imports/{$uuid}/records/{$riddle}", $this->writer, ['subject' => 'Physics'])->assertOk()->assertJsonPath('data.errors.0.path', 'subject');
        $this->api('PATCH', $this->central, "writer/imports/{$uuid}/records/{$riddle}", $this->writer, ['subject' => $this->subject])->assertOk()->assertJsonPath('data.errors', []);
        // bulk settings on chosen rows
        $this->api('POST', $this->central, "writer/imports/{$uuid}/settings", $this->writer, ['record_ids' => [$noSubject], 'changes' => ['subject' => 'Mathematics', 'difficulty' => 4]])
            ->assertOk()->assertJsonPath('data.counts.invalid', 0);
        $this->assertSame(4, QbImportRecord::find($noSubject)->payload['difficulty']);

        // select every valid one; the duplicate is not decided yet
        $this->api('POST', $this->central, "writer/imports/{$uuid}/select", $this->writer, ['all_valid' => true, 'selected' => true])->assertOk()->assertJsonPath('changed', 4);
        $this->api('POST', $this->central, "writer/imports/{$uuid}/select", $this->writer, ['record_ids' => [$noSubject], 'selected' => false])->assertOk();
        $first = $this->api('POST', $this->central, "writer/imports/{$uuid}/finalize", $this->writer)->assertOk()->json('result');
        $this->assertSame(['imported' => 2, 'invalid' => 0, 'duplicate_unresolved' => 1, 'skipped' => 0, 'failed' => 0], $first);
        $this->assertNull(QbImportRecord::find($noSubject)->qb_question_id, 'an unselected record never enters the bank');

        $this->api('POST', $this->central, "writer/imports/{$uuid}/records/{$dupe}/duplicate", $this->writer, ['choice' => 'skip'])->assertOk();
        $second = $this->api('POST', $this->central, "writer/imports/{$uuid}/finalize", $this->writer)->assertOk()->json('result');
        $this->assertSame(['imported' => 0, 'invalid' => 0, 'duplicate_unresolved' => 0, 'skipped' => 1, 'failed' => 0], $second, 'nothing imported twice');

        // the draft opens in the full editor with its content
        $qid = QbImportRecord::find($mcq)->qb_question_id;
        $open = $this->api('GET', $this->central, "writer/questions/{$qid}", $this->writer)->assertOk()->json('data');
        $this->assertSame(['review', $this->writer->id, 'en', 'If \(x^2 = 4\), x = ?'], [$open['status'], $open['created_by'], $open['language'], $open['question_text']]);
        $this->assertSame([true, false], array_column($open['options'], 'is_correct'));
        $this->api('PUT', $this->central, "writer/questions/{$qid}", $this->writer, ['question_text' => 'If \(x^2 = 9\), x = ?'])->assertStatus(422);
        $this->assertSame('If \(x^2 = 4\), x = ?', $this->api('GET', $this->central, "writer/questions/{$qid}", $this->writer)->json('data.question_text'));
        $this->api('PATCH', $this->central, "writer/imports/{$uuid}/records/{$mcq}", $this->writer, ['question_text' => 'x'])->assertStatus(422);
        $this->api('GET', $this->central, "writer/imports/{$uuid}", $this->writer)->assertJsonPath('data.counts.imported', 2);
    }

    public function test_an_invalid_record_cannot_be_selected_or_imported(): void
    {
        $uuid = $this->upload($this->writer, 'q.json', json_encode($this->questions()))->json('data.id');
        $bad = QbImportRecord::whereNotNull('errors')->value('id');
        $this->api('POST', $this->central, "writer/imports/{$uuid}/select", $this->writer, ['record_ids' => [$bad], 'selected' => true])->assertJsonPath('changed', 0);
        QbImportRecord::whereKey($bad)->update(['selected' => true]);       // even if it were selected
        $this->assertSame(1, $this->api('POST', $this->central, "writer/imports/{$uuid}/finalize", $this->writer)->json('result.invalid'));
        $this->assertSame(1, QbQuestion::count(), 'only the question that was there before');
    }

    public function test_the_downloadable_example_imports_cleanly_as_json_and_toon(): void
    {
        \App\Models\QbChapter::create(['qb_subject_id' => $this->subject, 'name_bn' => 'বীজগণিত', 'name_en' => 'Algebra']);
        QbSubject::create(['name_bn' => 'ইংরেজি', 'name_en' => 'English']);
        \App\Models\QbClassLevel::create(['name_bn' => 'নবম', 'name_en' => 'Class 9', 'education_level' => 'secondary', 'sort_order' => 9]);
        $json = $this->api('GET', $this->central, 'writer/imports/example.json', $this->writer)->assertOk()->getContent();
        $toon = $this->api('GET', $this->central, 'writer/imports/example.toon', $this->writer)->assertOk()->getContent();
        $schema = $this->api('GET', $this->central, 'writer/imports/schema.json', $this->writer)->assertOk()->json();
        $this->assertContains('fill_in_the_blank', $schema['$defs']['question']['properties']['question_type']['enum']);
        $this->assertSame('array', $schema['$defs']['question']['properties']['curriculum_node_ids']['type']);
        $this->assertSame([], json_decode($json, true)['questions'][0]['curriculum_node_ids']);
        $a = $this->upload($this->writer, 'example.json', $json)->assertCreated()->json('data');
        $b = $this->upload($this->writer, 'example.toon', $toon)->assertCreated()->json('data');
        foreach ([$a, $b] as $batch) $this->assertSame(['ready', 6, 6, 0], [$batch['status'], $batch['counts']['total'], $batch['counts']['valid'], $batch['counts']['invalid']], json_encode(QbImportRecord::whereNotNull('errors')->pluck('errors')));
        $records = fn ($uuid) => QbImportRecord::whereHas('batch', fn ($q) => $q->where('uuid', $uuid))->orderBy('record_index')->pluck('payload')->all();
        $this->assertSame($records($a['id']), $records($b['id']));
        $this->api('GET', $this->central, 'writer/imports/example.json', User::create(['institution_id' => null, 'name' => 'm', 'role' => 'content_moderator', 'phone' => '01822222222', 'password' => 'Writer-pass-26', 'is_active' => true]))->assertForbidden();
    }
}
