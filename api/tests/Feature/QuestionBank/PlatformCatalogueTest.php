<?php

namespace Tests\Feature\QuestionBank;

use App\Exceptions\CatalogueAccessException;
use App\Models\{QbChapter, QbQuestion, QbQuestionType, QbSubject, QbTopic, QbUnlock, QbWriterWallet};
use App\Support\{Catalogue, Tenancy};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// QB.0 (D65, docs/modules/question-bank.md §2): the platform catalogue is written from the central host only and read from an
// institution's host - published content only, platform-private rows (writers' money) never.
class PlatformCatalogueTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: QbSubject, 1: QbQuestion, 2: QbQuestion} a subject with one published and one draft question (central host) */
    private function catalogue(): array
    {
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Mathematics']);
        $chapter = QbChapter::create(['qb_subject_id' => $subject->id, 'name_bn' => 'সেট', 'name_en' => 'Sets']);
        $topic = QbTopic::create(['qb_chapter_id' => $chapter->id, 'name_bn' => 'উপসেট', 'name_en' => 'Subsets']);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $q = fn (string $status) => QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'qb_chapter_id' => $chapter->id,
            'qb_topic_id' => $topic->id, 'question_text' => "a {$status} question", 'status' => $status, 'created_by' => 1]);
        return [$subject, $q('published'), $q('draft')];
    }

    public function test_the_central_host_writes_and_sees_every_row(): void
    {
        [, $published, $draft] = $this->catalogue();
        $this->assertFalse(Catalogue::restricted());
        $this->assertEqualsCanonicalizing([$published->id, $draft->id], QbQuestion::pluck('id')->all());
        $this->assertSame(0, QbWriterWallet::count());
    }

    public function test_an_institution_reads_published_content_only(): void
    {
        [$subject, $published] = $this->catalogue();
        Tenancy::as($this->makeInstitution('qb-school'), function () use ($subject, $published) {
            $this->assertTrue(Catalogue::restricted());
            $this->assertSame([$published->id], QbQuestion::pluck('id')->all());
            $this->assertSame($subject->id, QbSubject::first()->id);                     // the curriculum is readable as it is
        });
    }

    public function test_an_institution_can_never_write_the_catalogue(): void
    {
        [$subject, $published] = $this->catalogue();
        Tenancy::as($this->makeInstitution('qb-school'), function () use ($subject, $published) {
            foreach ([
                'create' => fn () => QbSubject::create(['name_bn' => 'x', 'name_en' => 'x']),
                'update' => fn () => $subject->update(['name_en' => 'Changed']),
                'delete' => fn () => $subject->delete(),
                'soft delete' => fn () => $published->delete(),
            ] as $op => $call) {
                try {
                    $call();
                    $this->fail("catalogue {$op} ran from an institution's host");
                } catch (CatalogueAccessException) {
                    $this->addToAssertionCount(1);
                }
            }
        });
        $this->assertSame('Mathematics', $subject->fresh()->name_en);
        $this->assertNotNull(QbQuestion::find($published->id));
    }

    public function test_platform_private_rows_are_never_read_from_an_institution(): void
    {
        QbWriterWallet::create(['writer_user_id' => 1, 'balance' => '10.00']);
        Tenancy::as($this->makeInstitution('qb-school'), function () {
            $this->expectException(CatalogueAccessException::class);
            QbWriterWallet::count();
        });
    }

    public function test_the_named_exits_lift_the_rule_and_restore_it(): void
    {
        $this->catalogue();
        Tenancy::as($this->makeInstitution('qb-school'), function () {
            $wallet = Catalogue::asPlatform(fn () => QbWriterWallet::create(['writer_user_id' => 7, 'balance' => '0.50']));   // e.g. a writer's earning booked with the sale
            $this->assertSame('0.50', $wallet->balance);
            $this->assertSame(2, Tenancy::withoutTenancy(fn () => QbQuestion::count()));
            $this->assertSame(1, QbQuestion::count());                                   // back to published-only
            try {
                Catalogue::asPlatform(fn () => throw new \RuntimeException('boom'));
            } catch (\RuntimeException) {
            }
            $this->assertTrue(Catalogue::restricted(), 'an exception inside asPlatform() must not leave the exit open');
        });
    }

    public function test_institution_purchases_stay_tenant_scoped(): void
    {
        [, $published] = $this->catalogue();
        $a = $this->makeInstitution('qb-a');
        $b = $this->makeInstitution('qb-b');
        Tenancy::as($a, fn () => QbUnlock::create(['item_type' => 'question', 'item_id' => $published->id, 'unlocked_by' => 1, 'price' => '0.50', 'reason' => 'paid']));
        $this->assertSame(1, Tenancy::as($a, fn () => QbUnlock::count()));
        $this->assertSame(0, Tenancy::as($b, fn () => QbUnlock::count()));
    }
}
