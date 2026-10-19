<?php

namespace Tests\Unit;

use App\Traits\BelongsToInstitution;
use App\Traits\BelongsToOptionalInstitution;
use App\Traits\PlatformCatalogue;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ModelInventoryTest extends TestCase
{
    /** Platform-level models (docs/BUILD-SEQUENCE.md Step 1.2, AGENTS.md rule 8); PlatformSetting joins Release 1 with D57; Coupon is later */
    private const NO_TENANT_TRAIT = ['Institution', 'SubscriptionPlan', 'ThemePreset', 'OtpToken', 'PlatformSetting'];

    /** D65 (docs/modules/question-bank.md §2): the platform question-bank catalogue - no institution_id, PlatformCatalogue instead */
    private const PLATFORM_CATALOGUE = ['QbClassLevel', 'QbSubject', 'QbClassLevelSubject', 'QbChapter', 'QbChapterClassLevel', 'QbTopic', 'QbQuestionType',
        'QbQuestion', 'QbQuestionOption', 'QbCreativePart', 'QbQuestionStimulus', 'QbQuestionItem', 'QbQuestionClassLevel', 'QbQuestionOccurrence',
        'QbQuestionRevision', 'QbMedia', 'QbMediaLink', 'QbConcept', 'QbResource', 'QbPrice', 'QbPriceRule', 'QbWriterEarning', 'QbWriterWallet',
        'QbWriterWalletTxn', 'QbWithdrawalRequest', 'QbQuizPackage', 'QbQuiz', 'QbQuizQuestion', 'QbImportMap', 'QbImportBatch', 'QbImportRecord'];   // QbImportMap: D69; QbImport*: D123

    /** content an institution may read only once published; platform-private rows it may not read at all */
    private const CATALOGUE_PUBLISHED = ['QbQuestion', 'QbConcept', 'QbResource'];
    private const CATALOGUE_HIDDEN = ['QbQuestionRevision', 'QbWriterEarning', 'QbWriterWallet', 'QbWriterWalletTxn', 'QbWithdrawalRequest', 'QbImportMap', 'QbImportBatch', 'QbImportRecord'];

    /** institution_id may be NULL: own rules (docs/architecture/tenancy.md) */
    private const OWN_RULES = ['User', 'AuditLog'];

    public static function releaseTables(): array
    {
        $file = dirname(__DIR__, 3) . '/docs/release/r1-tables.txt';
        $tables = preg_split('/\s+/', trim(file_get_contents($file)));
        return array_combine($tables, array_map(fn ($t) => [$t], $tables));
    }

    private static function modelFor(string $table): string
    {
        $name = $table === 'parent_student' ? 'ParentStudent' : Str::studly(Str::singular($table));
        return 'App\\Models\\' . $name;
    }

    #[DataProvider('releaseTables')]
    public function test_every_release_table_has_a_model_on_that_table(string $table): void
    {
        $class = self::modelFor($table);
        $this->assertTrue(class_exists($class), "no model for table {$table}");
        $this->assertSame($table, (new $class)->getTable());
    }

    #[DataProvider('releaseTables')]
    public function test_tenant_trait_is_used_exactly_where_the_spec_says(string $table): void
    {
        $class = self::modelFor($table);
        $short = class_basename($class);
        $traits = class_uses_recursive($class);

        if ($short === 'AuditLog') {
            $this->assertContains(BelongsToOptionalInstitution::class, $traits);
        } elseif (in_array($short, self::PLATFORM_CATALOGUE, true)) {
            $this->assertNotContains(BelongsToInstitution::class, $traits, "{$short} is platform content, not tenant-scoped");
            $this->assertContains(PlatformCatalogue::class, $traits, "{$short} is missing PlatformCatalogue");
            $want = in_array($short, self::CATALOGUE_PUBLISHED, true) ? 'published' : (in_array($short, self::CATALOGUE_HIDDEN, true) ? 'none' : 'all');
            $this->assertSame($want, $class::TENANT_READ, "{$short}: what an institution's host may read");
        } elseif (in_array($short, [...self::NO_TENANT_TRAIT, ...self::OWN_RULES], true)) {
            $this->assertNotContains(BelongsToInstitution::class, $traits, "{$short} must not be tenant-scoped");
        } else {
            $this->assertContains(BelongsToInstitution::class, $traits, "{$short} is missing BelongsToInstitution");
        }
    }
}
