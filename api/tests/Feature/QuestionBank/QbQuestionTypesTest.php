<?php

namespace Tests\Feature\QuestionBank;

use App\Models\{QbMedia, QbQuestion, QbQuestionRevision, QbSubject, User};
use Database\Seeders\QbQuestionTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// QB.3 (D65, docs/modules/question-bank.md §3খ): a writer saves each core type - mcq, true_false, creative, fill_in_the_blank, short,
// one_word_answer - with LaTeX in the text and a picture; a draft may be unfinished but sending it for review needs the type's own
// parts; pictures are raster images on the private disk and only the uploader's own.
class QbQuestionTypesTest extends TestCase
{
    use RefreshDatabase;

    private string $central;
    private User $writer;
    private int $subject;
    private array $types;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('private');
        $this->central = 'admin.' . config('tenancy.base_domain');
        $this->writer = User::create(['institution_id' => null, 'name' => 'w', 'role' => 'content_writer', 'phone' => '01811111111', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->seed(QbQuestionTypeSeeder::class);
        $this->types = \App\Models\QbQuestionType::pluck('id', 'slug')->all();
        $this->subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths'])->id;
    }

    private function save(string $slug, array $body, ?User $as = null): \Illuminate\Testing\TestResponse
    {
        return $this->api('POST', $this->central, 'writer/questions', $as ?? $this->writer,
            ['qb_question_type_id' => $this->types[$slug], 'qb_subject_id' => $this->subject, 'question_text' => 'Solve $x^2 = 4$'] + $body);
    }

    private function submit(int $id): \Illuminate\Testing\TestResponse
    {
        return $this->api('POST', $this->central, "writer/questions/{$id}/submit", $this->writer);
    }

    private function upload(?User $as = null): int
    {
        return $this->api('POST', $this->central, 'writer/media', $as ?? $this->writer, ['file' => UploadedFile::fake()->image('graph.png', 200, 120)])
            ->assertCreated()->json('data.id');
    }

    public function test_the_six_core_types_are_seeded(): void
    {
        foreach (['creative', 'fill_in_the_blank', 'mcq', 'one_word_answer', 'short', 'true_false'] as $slug) $this->assertArrayHasKey($slug, $this->types);
        $this->assertCount(74, $this->types, "qbank's 75 entries, its duplicate slug `application` kept once (QB.4)");
    }

    public function test_language_and_content_mode_are_server_managed_for_writer_questions(): void
    {
        $this->save('short', ['language' => 'en'])->assertStatus(422)->assertJsonValidationErrors('language');
        $this->save('short', ['content_mode' => 'plain_text'])->assertStatus(422)->assertJsonValidationErrors('content_mode');

        $question = $this->save('short', [])->assertCreated()
            ->assertJsonPath('data.language', 'und')
            ->assertJsonPath('data.content_mode', 'mixed')->json('data');

        QbQuestion::whereKey($question['id'])->update(['language' => 'bn']);
        $updated = $this->api('PUT', $this->central, "writer/questions/{$question['id']}", $this->writer, [
            'question_text' => 'This update keeps the catalog language.',
        ])->assertOk()->assertJsonPath('data.language', 'bn')->assertJsonPath('data.content_mode', 'mixed')->json('data');

        $this->assertSame('bn', $updated['language']);
    }

    public function test_an_mcq_with_math_and_a_picture(): void
    {
        $media = $this->upload();
        $this->assertStringStartsWith('platform/qb/', QbMedia::find($media)->path);
        Storage::disk('private')->assertExists(QbMedia::find($media)->path);

        $q = $this->save('mcq', ['options' => [
            ['label' => 'ক', 'content_text' => '$2$', 'is_correct' => true], ['label' => 'খ', 'content_text' => '$-3$', 'is_correct' => false],
        ], 'media_ids' => [$media], 'occurrences' => [['board' => 'Dhaka', 'exam_type' => 'SSC', 'year' => 2024]]])->assertCreated()->json('data');
        $this->assertSame([['ক', '$2$', true], ['খ', '$-3$', false]], array_map(fn ($o) => [$o['label'], $o['content_text'], $o['is_correct']], $q['options']));
        $this->assertSame([$media], array_column($q['media'], 'id'));
        $this->assertNotEmpty($q['media'][0]['url']);
        $this->assertSame('Dhaka', $q['occurrences'][0]['board']);
        $this->assertSame('Solve $x^2 = 4$', $q['question_text']);
        $this->submit($q['id'])->assertOk()->assertJsonPath('data.status', 'review');

        // a list sent again REPLACES the stored one; every save is a revision with the parts
        $id = $this->save('mcq', ['options' => [['label' => 'ক', 'content_text' => 'a', 'is_correct' => false], ['label' => 'খ', 'content_text' => 'b', 'is_correct' => true]]])->json('data.id');
        $this->api('PUT', $this->central, "writer/questions/{$id}", $this->writer, ['options' => [['label' => 'ক', 'content_text' => 'only', 'is_correct' => true]]])
            ->assertOk()->assertJsonCount(1, 'data.options');
        $this->assertSame('only', QbQuestionRevision::where('qb_question_id', $id)->latest('id')->first()->snapshot['options'][0]['content_text']);
    }

    public function test_sending_for_review_needs_the_types_own_parts(): void
    {
        $noRight = $this->save('mcq', ['options' => [['label' => 'ক', 'content_text' => '1', 'is_correct' => false], ['label' => 'খ', 'content_text' => '2', 'is_correct' => false]]])->assertCreated()->json('data.id');
        $this->submit($noRight)->assertStatus(422)->assertJsonValidationErrors('options');
        $one = $this->save('mcq', ['options' => [['label' => 'ক', 'content_text' => '1', 'is_correct' => true]]])->json('data.id');
        $this->submit($one)->assertStatus(422)->assertJsonValidationErrors('options');

        $tf = $this->save('true_false', ['options' => [['label' => 'T', 'content_text' => 'সত্য', 'is_correct' => true], ['label' => 'F', 'content_text' => 'মিথ্যা', 'is_correct' => true]]])->json('data.id');
        $this->submit($tf)->assertStatus(422)->assertJsonValidationErrors('options');
        $this->api('PUT', $this->central, "writer/questions/{$tf}", $this->writer, ['options' => [['label' => 'T', 'content_text' => 'সত্য', 'is_correct' => true], ['label' => 'F', 'content_text' => 'মিথ্যা', 'is_correct' => false]]])->assertOk();
        $this->submit($tf)->assertOk();

        $creative = $this->save('creative', [])->json('data.id');
        $this->submit($creative)->assertStatus(422)->assertJsonValidationErrors('creative_parts');
        $this->api('PUT', $this->central, "writer/questions/{$creative}", $this->writer, ['creative_parts' => [
            ['part_label' => 'ক', 'cognitive_level' => 'knowledge', 'marks' => 1, 'question_text' => 'সংজ্ঞা দাও', 'answer_text' => '...'],
            ['part_label' => 'খ', 'cognitive_level' => 'understanding', 'marks' => 2, 'question_text' => 'ব্যাখ্যা করো'],
            ['part_label' => 'গ', 'cognitive_level' => 'application', 'marks' => 3, 'question_text' => '$\\frac{a}{b}$ নির্ণয় করো'],
            ['part_label' => 'ঘ', 'cognitive_level' => 'higher_order', 'marks' => 4, 'question_text' => 'বিশ্লেষণ করো'],
        ]])->assertOk()->assertJsonCount(4, 'data.creative_parts');
        $this->submit($creative)->assertOk();

        $blank = $this->save('fill_in_the_blank', ['question_text' => 'Water boils at 100 degrees.', 'answer_text' => 'Celsius'])->json('data.id');
        $this->submit($blank)->assertStatus(422)->assertJsonValidationErrors('question_text');
        $this->api('PUT', $this->central, "writer/questions/{$blank}", $this->writer, ['question_text' => 'Water boils at 100 ___.'])->assertOk();
        $this->submit($blank)->assertOk();

        foreach (['short', 'one_word_answer'] as $slug) {
            $id = $this->save($slug, [])->json('data.id');
            $this->submit($id)->assertStatus(422)->assertJsonValidationErrors('answer_text');
            $this->api('PUT', $this->central, "writer/questions/{$id}", $this->writer, ['answer_text' => 'দুই'])->assertOk();
            $this->submit($id)->assertOk();
        }
    }

    public function test_pictures_are_raster_images_and_only_the_uploaders_own(): void
    {
        $svg = UploadedFile::fake()->createWithContent('x.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
        $this->api('POST', $this->central, 'writer/media', $this->writer, ['file' => $svg])->assertStatus(422)->assertJsonValidationErrors('file');
        $this->api('POST', $this->central, 'writer/media', $this->writer, ['file' => UploadedFile::fake()->image('big.png')->size(3000)])->assertStatus(422);
        $moderator = User::create(['institution_id' => null, 'name' => 'm', 'role' => 'content_moderator', 'phone' => '01822222222', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $this->api('POST', $this->central, 'writer/media', $moderator, ['file' => UploadedFile::fake()->image('a.png')])->assertForbidden();

        $other = User::create(['institution_id' => null, 'name' => 'w2', 'role' => 'content_writer', 'phone' => '01833333333', 'password' => 'Writer-pass-26', 'is_active' => true]);
        $theirs = $this->upload($other);
        $this->save('short', ['media_ids' => [$theirs]])->assertStatus(422)->assertJsonValidationErrors('media_ids');
        $this->assertSame(0, QbQuestion::count());
    }

    /** R2.1.2 (D114 (1)): a picture is attached, replaced and removed; the link handed back is short-lived and on the private disk */
    public function test_a_picture_is_attached_replaced_and_removed(): void
    {
        [$first, $second] = [$this->upload(), $this->upload()];
        $id = $this->save('short', ['answer_text' => 'A', 'media_ids' => [$first]])->assertCreated()->assertJsonPath('data.media.0.id', $first)->json('data.id');
        $this->assertStringContainsString('expiration=', $this->api('GET', $this->central, "writer/questions/{$id}", $this->writer)->json('data.media.0.url'));
        $this->api('PUT', $this->central, "writer/questions/{$id}", $this->writer, ['media_ids' => [$second]])->assertOk()->assertJsonCount(1, 'data.media')->assertJsonPath('data.media.0.id', $second);
        $this->api('PUT', $this->central, "writer/questions/{$id}", $this->writer, ['media_ids' => []])->assertOk()->assertJsonCount(0, 'data.media');
        $this->api('PUT', $this->central, "writer/questions/{$id}", $this->writer, ['question_text' => 'kept'])->assertOk()->assertJsonCount(0, 'data.media');
    }
}
