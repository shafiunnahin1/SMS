<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbImportRecord, QbQuestion, QbSubject, User};
use App\Services\QbImportService;
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// D150 (R2.1.3-json-toon-import) Done When: bulk source attribution changes only selected, valid, not-yet-imported records - an
// already imported record (and its question) and a rejected record stay as they were, and a rejected record cannot be made
// importable by it; the imported question is never published by the import
class QbImportSourceScopeTest extends TestCase
{
    use RefreshDatabase;

    public function test_bulk_source_never_touches_imported_or_rejected_records(): void
    {
        Storage::fake('private');
        $central = 'admin.' . config('tenancy.base_domain');
        $this->seed(QbQuestionTypeSeeder::class);
        $writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111112', 'password' => 'Writer-pass-26', 'is_active' => true]);
        QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Mathematics']);
        $mcq = fn (string $text) => ['question_type' => 'mcq', 'question_text' => $text, 'settings' => ['subject' => ['name' => 'Mathematics']],
            'options' => [['label' => 'A', 'text' => '1', 'is_correct' => true], ['label' => 'B', 'text' => '2', 'is_correct' => false]]];
        $json = json_encode(['schema_version' => QbImportService::SCHEMA_V5, 'document' => ['language' => 'en'],
            'questions' => [$mcq('First distinct question?'), $mcq('Second distinct question?'), $mcq('Third distinct question?')]], JSON_UNESCAPED_UNICODE);
        $uuid = $this->api('POST', $central, 'writer/imports', $writer, ['files' => [UploadedFile::fake()->createWithContent('q.json', $json)]])->json('data.id');
        [$imported, $rejected, $open] = [0, 1, 2];
        $row = fn (int $i) => QbImportRecord::where('record_index', $i)->firstOrFail();

        // record 0 imported first, record 1 rejected by the reviewer, record 2 left selected
        $this->api('POST', $central, "writer/imports/{$uuid}/select", $writer, ['record_ids' => [$row($imported)->id], 'selected' => true])->assertOk();
        $this->api('POST', $central, "writer/imports/{$uuid}/finalize", $writer)->assertOk()->assertJsonPath('result.imported', 1);
        $questionId = $row($imported)->qb_question_id;
        $this->assertNotNull($questionId);
        $this->assertNotSame('published', QbQuestion::findOrFail($questionId)->status, 'the import never publishes');
        $this->api('POST', $central, "writer/imports/{$uuid}/records/{$row($rejected)->id}/reject", $writer, ['rejected' => true])->assertOk();
        $this->api('POST', $central, "writer/imports/{$uuid}/select", $writer, ['record_ids' => [$row($open)->id], 'selected' => true])->assertOk();
        $before = [$row($imported)->payload, $row($rejected)->payload, QbQuestion::findOrFail($questionId)->occurrences()->count()];

        $source = ['note' => 'school', 'institution_name' => 'North High School', 'board' => 'NHS', 'exam_type' => 'Final', 'year' => 2026,
            'question_number' => '7', 'set_label' => 'A', 'page_reference' => 'p. 3'];
        $this->api('POST', $central, "writer/imports/{$uuid}/settings", $writer, ['record_ids' => [$row($imported)->id, $row($rejected)->id, $row($open)->id],
            'changes' => ['source_occurrence' => $source]])->assertOk()->assertJsonPath('changed', 1);

        $this->assertSame([$source], $row($open)->payload['occurrences']);
        $this->assertSame($before, [$row($imported)->payload, $row($rejected)->payload, QbQuestion::findOrFail($questionId)->occurrences()->count()]);
        $this->assertFalse((bool) $row($rejected)->selected);
        $this->api('POST', $central, "writer/imports/{$uuid}/select", $writer, ['record_ids' => [$row($rejected)->id], 'selected' => true])->assertOk();
        $this->assertFalse((bool) $row($rejected)->fresh()->selected, 'a rejected record cannot be made importable');
    }
}
