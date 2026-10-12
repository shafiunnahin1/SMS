<?php

namespace Tests\Feature\QuestionBank;

use App\Http\Resources\QbQuestionPublicResource;
use App\Models\{QbQuestion, QbQuestionType, QbSubject};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// docs/modules/question-bank.md §2 "QuestionAnswerNeverLeaksTest" (QB.3): outside the writers' panel a question leaves only through
// QbQuestionPublicResource, and without an unlock that shape carries no answer, explanation, right option or part answer -
// checked on the JSON text itself, not just on the keys we expect.
class QuestionAnswerNeverLeaksTest extends TestCase
{
    use RefreshDatabase;

    private const SECRETS = ['SECRET-ANSWER', 'SECRET-EXPLANATION', 'SECRET-PART-ANSWER'];
    private const ANSWER_KEYS = ['is_correct', 'answer_text', 'answer_json', 'explanation_text', 'explanation_json'];

    /** Files that may touch the question models directly (each with its reason); everything else must use the public resource */
    private const DIRECT = [
        'app/Http/Controllers/QuestionBank/QbQuestionController.php' => "the writers' panel (central host, writer roles only)",
        'app/Http/Controllers/QuestionBank/QbCurriculumController.php' => 'only asks whether a curriculum node is in use',
        'app/Http/Controllers/QuestionBank/QbWriterController.php' => "counts a writer's questions for the Super Admin",
        'app/Http/Resources/QbQuestionPublicResource.php' => 'the public shape itself',
        'app/Services/QbPurchaseService.php' => "QB.7: finds the item to price and unlock; returns only the unlock and amounts",
        'app/Services/QbPricingService.php' => "QB.6: reads a question's type, place and classes to price it; returns only amounts",
        'app/Http/Controllers/QuestionBank/QbPricingController.php' => "QB.6: the Super Admin's preview finds sample questions by id; returns only quotes",
        'app/Console/Commands/QbImportFromQbank.php' => "QB.11 (D69): the CLI import writes questions from qbank's database; it returns only counts",
        'app/Services/QbEarningService.php' => "QB.10b: finds a sold item's author (created_by) to credit; returns nothing about the question",
        'app/Services/QbQuizMarker.php' => "QB.10: marks a quiz answer on the server; returns marks, the right answer only for a submitted attempt (QbQuizService::review)",
        'app/Http/Controllers/QuestionBank/QbQuizController.php' => "QB.10: the Super Admin's quiz editor (central host) checks question ids are published and auto-marked; returns ids and question texts",
        'app/Http/Controllers/QuestionBank/QbPublicQuizController.php' => "QB.10: the public page filters question ids to the quiz and to published ones; questions go out through QbQuizService::paper, marks only",
    ];

    private function question(): QbQuestion
    {
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $q = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => '$x^2 = 4$, x = ?',
            'answer_text' => 'SECRET-ANSWER', 'explanation_text' => 'SECRET-EXPLANATION', 'status' => 'published', 'created_by' => 1]);
        $q->options()->create(['label' => 'ক', 'content_text' => '2', 'is_correct' => true, 'sort_order' => 0]);
        $q->options()->create(['label' => 'খ', 'content_text' => '3', 'is_correct' => false, 'sort_order' => 1]);
        $q->creativeParts()->create(['part_label' => 'ক', 'cognitive_level' => 'knowledge', 'marks' => 1, 'question_text' => 'What is x?', 'answer_text' => 'SECRET-PART-ANSWER']);
        return $q;
    }

    private static function keys(mixed $v): array
    {
        if (!is_array($v)) return [];
        $out = [];
        foreach ($v as $k => $x) { if (is_string($k)) $out[] = $k; array_push($out, ...self::keys($x)); }
        return $out;
    }

    public function test_without_an_unlock_nothing_of_the_answer_is_in_the_json(): void
    {
        $locked = QbQuestionPublicResource::make($this->question(), unlocked: false);
        $json = json_encode($locked, JSON_UNESCAPED_UNICODE);
        foreach (self::SECRETS as $secret) $this->assertStringNotContainsString($secret, $json);
        $this->assertSame([], array_values(array_intersect(self::keys($locked), self::ANSWER_KEYS)));
        $this->assertSame(['2', '3'], array_column($locked['options'], 'content_text'), 'the option texts are shown, only not which is right');
        $this->assertSame('What is x?', $locked['creative_parts'][0]['question_text']);
        $this->assertFalse($locked['unlocked']);
    }

    public function test_with_an_unlock_everything_is_there(): void
    {
        $open = QbQuestionPublicResource::make($this->question(), unlocked: true);
        $json = json_encode($open, JSON_UNESCAPED_UNICODE);
        foreach (self::SECRETS as $secret) $this->assertStringContainsString($secret, $json);
        $this->assertSame([true, false], array_column($open['options'], 'is_correct'));
    }

    public function test_every_other_use_of_the_question_models_goes_through_the_public_resource(): void
    {
        $root = dirname(__DIR__, 3);
        $bad = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root . '/app', \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            if ($f->getExtension() !== 'php') continue;
            $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($root) + 1));
            if (str_starts_with($rel, 'app/Models/') || isset(self::DIRECT[$rel])) continue;
            $code = file_get_contents($f->getPathname());
            if (preg_match('/\b(QbQuestion|QbQuestionOption|QbCreativePart)\b(?!Type|Revision|PublicResource|Controller)/', $code) && !str_contains($code, 'QbQuestionPublicResource')) $bad[] = $rel;
        }
        $this->assertSame([], $bad, 'question models used outside the writers\' panel without QbQuestionPublicResource');
        foreach (array_keys(self::DIRECT) as $path) $this->assertFileExists("{$root}/{$path}", "stale entry {$path}");
    }
}
