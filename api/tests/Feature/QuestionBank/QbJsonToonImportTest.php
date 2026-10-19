<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbImportBatch, QbImportRecord, QbQuestion, QbQuestionType, QbSubject, User};
use App\Services\QbImportService;
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
        $this->assertSame(['draft', $this->writer->id, 'en', 'If \(x^2 = 4\), x = ?'], [$open['status'], $open['created_by'], $open['language'], $open['question_text']]);
        $this->assertSame([true, false], array_column($open['options'], 'is_correct'));
        $this->api('PUT', $this->central, "writer/questions/{$qid}", $this->writer, ['question_text' => 'If \(x^2 = 9\), x = ?'])->assertOk();
        $this->assertSame('If \(x^2 = 9\), x = ?', $this->api('GET', $this->central, "writer/questions/{$qid}", $this->writer)->json('data.question_text'));
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
        $a = $this->upload($this->writer, 'example.json', $json)->assertCreated()->json('data');
        $b = $this->upload($this->writer, 'example.toon', $toon)->assertCreated()->json('data');
        foreach ([$a, $b] as $batch) $this->assertSame(['ready', 6, 6, 0], [$batch['status'], $batch['counts']['total'], $batch['counts']['valid'], $batch['counts']['invalid']], json_encode(QbImportRecord::whereNotNull('errors')->pluck('errors')));
        $records = fn ($uuid) => QbImportRecord::whereHas('batch', fn ($q) => $q->where('uuid', $uuid))->orderBy('record_index')->pluck('payload')->all();
        $this->assertSame($records($a['id']), $records($b['id']));
        $this->api('GET', $this->central, 'writer/imports/example.json', User::create(['institution_id' => null, 'name' => 'm', 'role' => 'content_moderator', 'phone' => '01822222222', 'password' => 'Writer-pass-26', 'is_active' => true]))->assertForbidden();
    }
}
