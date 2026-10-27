<?php

namespace Tests\Feature\Ai;

use App\Models\{AiHelpArticle, QbQuestion, QbQuestionType, QbSubject};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\TestCase;

// D166 AI-Q6: ai:evaluate reports the source set (labelled as a small set below 200 items, never as the 200-question gate), the
// shipped "not found" set (off-topic questions must get not_found), the help set (each approved article found by its title for a
// user of its role, skipping roles nobody holds here) and the model off / on, each on its own line; any section below its bar fails.
class AiEvaluateSetsTest extends TestCase
{
    use DatabaseTruncation;   // FULLTEXT sees committed rows only

    public function test_each_set_is_reported_separately(): void
    {
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        foreach (['৪ ও ৬ এর লসাগু কত হবে', 'একটি ত্রিভুজের তিন কোণের সমষ্টি কত ডিগ্রি'] as $text) {
            QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => $text, 'status' => 'published', 'created_by' => 1]);
        }
        $i = $this->makeInstitution('aieval-sets', 'school');
        $this->makeUser($i, 'admin');
        $this->makeUser($i, 'teacher');
        $this->artisan('ai:help-seed')->assertSuccessful();
        Tenancy::withoutTenancy(fn () => AiHelpArticle::whereIn('slug', ['admit-student', 'fee-category', 'teacher-attendance', 'parent-results'])
            ->update(['status' => 'approved', 'approved_at' => now()]));
        $file = sys_get_temp_dir() . '/ai-eval-sets-' . uniqid() . '.json';

        $this->artisan('ai:evaluate', ['file' => $file, '--make' => 2, '--institution' => 'aieval-sets'])
            ->expectsOutputToContain('[sources] small set (2 < 200, not the 200-question gate; 2 published)')
            ->expectsOutputToContain('top-3 hits 2')
            ->expectsOutputToContain('[not found] items 20 · answered not found 20 (100.0%')
            ->expectsOutputToContain('[help] articles 6 · found 6 (100.0%, bar 90%) · skipped (no user of the role) 2')   // admin and teacher articles, bn + en; the parent one is skipped
            ->expectsOutputToContain('[model] off - every answer above is deterministic')
            ->expectsOutputToContain('PASS')->assertSuccessful();

        // a not-found item that does have a source makes that section, and the run, fail
        $nf = sys_get_temp_dir() . '/ai-nf-' . uniqid() . '.json';
        file_put_contents($nf, json_encode(['items' => ['৪ ও ৬ এর লসাগু কত হবে']], JSON_UNESCAPED_UNICODE));
        $this->artisan('ai:evaluate', ['file' => $file, '--institution' => 'aieval-sets', '--not-found' => $nf])
            ->expectsOutputToContain('[not found] items 1 · answered not found 0 (0.0%')->expectsOutputToContain('FAIL')->assertFailed();
        @unlink($file);
        @unlink($nf);
    }
}
