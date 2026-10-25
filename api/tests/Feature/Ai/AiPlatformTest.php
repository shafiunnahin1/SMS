<?php

namespace Tests\Feature\Ai;

use App\Models\{AiAnswerBank, AiConversation, QbQuestion, QbQuestionType, QbSubject, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\TestCase;

// D164 AI-P1.5: the Super Admin sets the free answers a day and an optional daily question limit (reached -> 422), sees the usage
// report (counts only), and the ai:evaluate quality gate measures the top-3 source hit rate and never sees another institution's
// own answer-bank rows
class AiPlatformTest extends TestCase
{
    use DatabaseTruncation;

    protected function tearDown(): void
    {
        $this->truncateDatabaseTables();
        parent::tearDown();
    }

    private function superAdmin(): User
    {
        return User::create(['institution_id' => null, 'name' => 'SA', 'role' => 'super_admin', 'phone' => '01799000009', 'password' => 'Super-pass-2026', 'is_active' => true]);
    }

    public function test_settings_limit_and_report(): void
    {
        $central = 'admin.' . config('tenancy.base_domain');
        $sa = $this->superAdmin();
        $this->api('GET', $central, 'super/ai-settings', $sa)->assertOk()->assertJsonPath('data', ['free_answers_per_day' => 20, 'daily_question_limit' => null, 'student_free_answers_per_day' => 20]);   // D165 ST.6 adds the student quota
        $this->api('PUT', $central, 'super/ai-settings', $sa, ['free_answers_per_day' => -1])->assertStatus(422);
        $this->api('PUT', $central, 'super/ai-settings', $sa, ['free_answers_per_day' => 5, 'daily_question_limit' => 1])->assertOk()
            ->assertJsonPath('data', ['free_answers_per_day' => 5, 'daily_question_limit' => 1, 'student_free_answers_per_day' => 20]);

        $i = $this->makeInstitution('aiplat', 'school');
        $t = $this->makeUser($i, 'teacher');
        $this->api('GET', $central, 'super/ai-settings', $t)->assertForbidden();         // a teacher is no Super Admin
        $chat = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $t->id, 'title' => 'x'])->id);
        $this->api('POST', $this->hostOf($i), "ai/conversations/{$chat}/messages", $t, ['text' => 'গসাগু'])->assertCreated();
        $this->api('POST', $this->hostOf($i), "ai/conversations/{$chat}/messages", $t, ['text' => 'লসাগু'])->assertStatus(422)->assertJsonPath('error', 'ai_daily_limit');

        $report = $this->api('GET', $central, 'super/ai-report', $sa, ['days' => 3])->assertOk()->json('data');
        $this->assertCount(3, $report['days']);
        $this->assertSame([1, 1, 1], [end($report['days'])['questions'], end($report['days'])['not_found'], $report['unreviewed']]);
        $this->assertStringNotContainsString('গসাগু', json_encode($report, JSON_UNESCAPED_UNICODE), 'counts only');
    }

    public function test_the_quality_gate_measures_top_three_and_sees_no_other_institution(): void
    {
        $subject = QbSubject::create(['name_bn' => 'গণিত', 'name_en' => 'Maths']);
        $type = QbQuestionType::create(['slug' => 'mcq', 'name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        foreach (['৪ ও ৬ এর লসাগু কত হবে', 'একটি ত্রিভুজের তিন কোণের সমষ্টি কত ডিগ্রি', 'বাংলাদেশের রাজধানীর নাম কী'] as $text) {
            QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => $text, 'status' => 'published', 'created_by' => 1]);
        }
        $a = $this->makeInstitution('aieval', 'school');
        $b = $this->makeInstitution('aievalb', 'school');
        Tenancy::as($b, fn () => AiAnswerBank::create(['question_text' => 'ত্রিভুজের কোণের সমষ্টি', 'answer_text' => 'B-ONLY']));
        $file = sys_get_temp_dir() . '/ai-eval-' . uniqid() . '.json';
        $this->artisan('ai:evaluate', ['file' => $file, '--make' => 3, '--institution' => 'aieval'])
            ->expectsOutputToContain('wrote 3 items')->expectsOutputToContain('top-3 hits 3')->expectsOutputToContain('cross-institution answers 0')->expectsOutputToContain('PASS')->assertSuccessful();
        $this->artisan('ai:evaluate', ['file' => $file, '--institution' => 'nope'])->assertFailed();
        @unlink($file);
    }
}
