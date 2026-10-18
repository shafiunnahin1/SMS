<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbGraphDataset, QbQuestion, QbQuestionType, QbSubject, User};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// R2.1.2 / D115 (3): qbank's graph-dataset API - qbank's response shape, a writer's own datasets only, moderators read and change
// nothing, cells cleaned and limits kept, an edit from an older version refused, a dataset used by a published question kept (D116).
class QbGraphDatasetTest extends TestCase
{
    use RefreshDatabase;

    private string $central;

    protected function setUp(): void
    {
        parent::setUp();
        $this->central = 'admin.' . config('tenancy.base_domain');
    }

    private function person(string $role, string $phone): User
    {
        return User::create(['institution_id' => null, 'name' => $role, 'role' => $role, 'phone' => $phone, 'password' => 'Writer-pass-26', 'is_active' => true]);
    }

    private function body(array $extra = []): array
    {
        return $extra + ['name' => 'বৃষ্টিপাত', 'headers' => ['মাস', 'mm', ''], 'rows' => [['জানুয়ারি', 12, true], ['ফেব্রুয়ারি', 20.5, null]], 'metadata' => ['chart_type' => 'bar', 'evil' => 'x']];
    }

    public function test_a_writer_keeps_their_own_datasets_in_qbanks_shape(): void
    {
        $writer = $this->person('content_writer', '01811111111');
        $other = $this->person('content_writer', '01822222222');
        $made = $this->api('POST', $this->central, 'writer/graph-datasets', $writer, $this->body())->assertCreated()
            ->assertJsonPath('ok', true)->assertJsonPath('dataset.rowCount', 2)->assertJsonPath('dataset.columnCount', 3)
            ->assertJsonPath('dataset.version', 1)->assertJsonPath('dataset.inUse', false)->json('dataset');
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $made['uuid']);
        $full = $this->api('GET', $this->central, "writer/graph-datasets/{$made['uuid']}", $writer)->assertOk()->json('dataset');
        $this->assertSame(['মাস', 'mm', 'Column 3'], $full['headers'], 'an empty header gets a name');
        $this->assertSame([['জানুয়ারি', 12, 1], ['ফেব্রুয়ারি', 20.5, null]], $full['rows'], 'cells cleaned as qbank does');
        $this->assertSame(['chart_type' => 'bar'], QbGraphDataset::first()->metadata, 'only known metadata is kept');

        $this->assertCount(1, $this->api('GET', $this->central, 'writer/graph-datasets', $writer)->json('datasets'));
        $this->assertCount(0, $this->api('GET', $this->central, 'writer/graph-datasets', $other)->json('datasets'));
        $this->api('GET', $this->central, "writer/graph-datasets/{$made['uuid']}", $other)->assertForbidden();
        $this->api('PUT', $this->central, "writer/graph-datasets/{$made['uuid']}", $other, $this->body())->assertForbidden();
        $this->api('DELETE', $this->central, "writer/graph-datasets/{$made['uuid']}", $other)->assertForbidden();
    }

    public function test_moderators_read_and_change_nothing_and_old_edits_are_refused(): void
    {
        $writer = $this->person('content_writer', '01811111111');
        $moderator = $this->person('content_moderator', '01833333333');
        $uuid = $this->api('POST', $this->central, 'writer/graph-datasets', $writer, $this->body())->json('dataset.uuid');
        $this->api('GET', $this->central, "writer/graph-datasets/{$uuid}", $moderator)->assertOk();
        $this->api('POST', $this->central, 'writer/graph-datasets', $moderator, $this->body())->assertForbidden();
        $this->api('PUT', $this->central, "writer/graph-datasets/{$uuid}", $moderator, $this->body())->assertForbidden();

        $this->api('PUT', $this->central, "writer/graph-datasets/{$uuid}", $writer, $this->body(['version' => 1, 'rows' => [['মার্চ', 3]]]))->assertOk()->assertJsonPath('dataset.version', 2);
        $this->api('PUT', $this->central, "writer/graph-datasets/{$uuid}", $writer, $this->body(['version' => 1]))->assertStatus(409)
            ->assertJsonPath('code', 'DATASET_VERSION_CONFLICT')->assertJsonPath('dataset.version', 2);
        $this->assertSame([['মার্চ', 3, null]], $this->api('GET', $this->central, "writer/graph-datasets/{$uuid}", $writer)->json('dataset.rows'), 'the newer edit is kept');
    }

    public function test_limits_hold_and_an_attached_dataset_is_not_deleted(): void
    {
        $writer = $this->person('content_writer', '01811111111');
        $this->api('POST', $this->central, 'writer/graph-datasets', $writer, $this->body(['headers' => array_fill(0, 81, 'c')]))->assertStatus(422);
        $this->api('POST', $this->central, 'writer/graph-datasets', $writer, $this->body(['headers' => []]))->assertStatus(422);
        $this->api('POST', $this->central, 'writer/graph-datasets', $writer, $this->body(['rows' => ['not a row']]))->assertStatus(422)->assertJsonValidationErrors('dataset');
        $long = $this->api('POST', $this->central, 'writer/graph-datasets', $writer, $this->body(['rows' => [[str_repeat('অ', 3000)]]]))->assertCreated()->json('dataset.uuid');
        $this->assertSame(2048, mb_strlen($this->api('GET', $this->central, "writer/graph-datasets/{$long}", $writer)->json('dataset.rows.0.0')));

        $free = $this->api('POST', $this->central, 'writer/graph-datasets', $writer, $this->body())->json('dataset.uuid');
        $used = $this->api('POST', $this->central, 'writer/graph-datasets', $writer, $this->body())->json('dataset.uuid');
        $type = QbQuestionType::create(['slug' => 'short', 'name_bn' => 'সংক্ষিপ্ত', 'name_en' => 'Short', 'family' => 'short'])->id;
        $q = QbQuestion::create(['qb_question_type_id' => $type, 'qb_subject_id' => QbSubject::create(['name_bn' => 'ভূগোল', 'name_en' => 'Geo'])->id, 'question_text' => 'Q', 'status' => 'draft', 'created_by' => $writer->id]);
        QbGraphDataset::where('uuid', $used)->update(['qb_question_id' => $q->id]);
        $draftOnly = $this->api('POST', $this->central, 'writer/graph-datasets', $writer, $this->body())->json('dataset.uuid');
        QbGraphDataset::where('uuid', $draftOnly)->update(['qb_question_id' => $q->id]);
        $this->api('DELETE', $this->central, "writer/graph-datasets/{$draftOnly}", $writer)->assertOk();   // D116: only a published question's dataset is kept
        $q->update(['status' => 'published']);
        $this->api('DELETE', $this->central, "writer/graph-datasets/{$used}", $writer)->assertStatus(409)->assertJsonPath('code', 'DATASET_IN_USE');
        $this->api('DELETE', $this->central, "writer/graph-datasets/{$free}", $writer)->assertOk()->assertJsonPath('deleted', $free);
        $this->assertSoftDeleted('qb_graph_datasets', ['uuid' => $free]);
    }
}
