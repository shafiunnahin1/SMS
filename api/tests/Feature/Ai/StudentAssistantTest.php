<?php

namespace Tests\Feature\Ai;

use App\Models\{AiAnswerReveal, AiConversation, AiMessage, AiReview, LearnerProfile, PlatformSetting, QbQuestion, QbQuestionType, QbQuiz, QbQuizAttempt, QbQuizQuestion, QbSubject, User};
use App\Services\Ai\AssistantService;
use App\Services\Learner\LearnerRegistrationService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Tests\TestCase;

// D165 (4) ST.6: students use the assistant; a student's free answers are counted alone (20 a day by default, a Super Admin
// setting); a question of a quiz the student is taking now is never answered meanwhile; a student deletes their own chat (not
// another's), and the day's free answers are not given back. FULLTEXT sees only committed rows, so this test commits and truncates.
class StudentAssistantTest extends TestCase
{
    use DatabaseTruncation;

    protected function tearDown(): void
    {
        $this->truncateDatabaseTables();
        parent::tearDown();
    }

    private function question(string $text, string $secret = 'SECRET'): QbQuestion
    {
        $subject = QbSubject::firstOrCreate(['name_bn' => 'গণিত'], ['name_en' => 'Maths']);
        $type = QbQuestionType::firstOrCreate(['slug' => 'mcq'], ['name_bn' => 'বহুনির্বাচনী', 'name_en' => 'MCQ', 'family' => 'mcq']);
        $q = QbQuestion::create(['qb_question_type_id' => $type->id, 'qb_subject_id' => $subject->id, 'question_text' => $text,
            'answer_text' => "{$secret}-ANSWER", 'explanation_text' => "{$secret}-EXPLANATION", 'status' => 'published', 'created_by' => 1, 'published_at' => now()]);
        $q->options()->create(['label' => 'ক', 'content_text' => '১২', 'is_correct' => true, 'sort_order' => 0]);
        return $q;
    }

    private function learner(string $phone): User
    {
        $i = LearnerRegistrationService::institution();
        $u = User::create(['institution_id' => $i->id, 'name' => 'L', 'phone' => $phone, 'role' => 'student', 'password' => 'Learner@2026', 'is_active' => true]);
        Tenancy::as($i, fn () => LearnerProfile::create(['user_id' => $u->id]));
        return $u;
    }

    private function ask(User $u, string $text, ?int &$chat = null)
    {
        $host = LearnerRegistrationService::host();
        $chat ??= $this->api('POST', $host, 'ai/conversations', $u, ['title' => 'x'])->assertCreated()->json('data.id');
        return $this->api('POST', $host, "ai/conversations/{$chat}/messages", $u, ['text' => $text])->assertCreated()->json('data');
    }

    public function test_per_student_quota_running_quiz_block_and_own_chat_delete(): void
    {
        $q = $this->question('৪ ও ৬ এর লসাগু কত');
        $other = $this->question('বৃত্তের ক্ষেত্রফল নির্ণয়ের সূত্র', 'OTHER');
        PlatformSetting::write(AssistantService::STUDENT_QUOTA_KEY, 1);
        $a = $this->learner('01711111111');
        $b = $this->learner('01722222222');

        $r = $this->ask($a, '৪ ও ৬ এর লসাগু কত');
        $this->assertStringContainsString('SECRET-EXPLANATION', $r['answer']['body'], 'within the student\'s own quota');
        $this->assertSame(0, $r['free_left']);
        $this->assertStringNotContainsString('OTHER-', json_encode($this->ask($a, 'বৃত্তের ক্ষেত্রফল নির্ণয়ের সূত্র'), JSON_UNESCAPED_UNICODE), 'quota used up');
        $this->assertStringContainsString('OTHER-EXPLANATION', $this->ask($b, 'বৃত্তের ক্ষেত্রফল নির্ণয়ের সূত্র')['answer']['body'], 'another student has their own quota');

        // a quiz B is taking right now: its question is not answered, even within the quota
        $c = $this->learner('01733333333');
        $quiz = QbQuiz::create(['access' => 'public', 'title' => 'Q', 'duration_minutes' => 10, 'question_count' => 1, 'is_active' => true]);
        QbQuizQuestion::create(['qb_quiz_id' => $quiz->id, 'qb_question_id' => $q->id, 'sort_order' => 0]);
        Tenancy::as(LearnerRegistrationService::institution(), fn () => QbQuizAttempt::create(['student_user_id' => $c->id, 'qb_quiz_id' => $quiz->id, 'started_at' => now(), 'total' => 1]));
        $blocked = $this->ask($c, '৪ ও ৬ এর লসাগু কত');
        $this->assertStringNotContainsString('SECRET', json_encode($blocked, JSON_UNESCAPED_UNICODE), 'a running quiz\'s answer');
        $this->assertSame(1, $blocked['free_left'], 'nothing counted');

        // delete an own chat: messages and reviews go, the day's count stays; another student's chat is a 404
        $chat = null;
        $this->ask($b, '৪ ও ৬ এর লসাগু কত', $chat);
        $host = LearnerRegistrationService::host();
        $this->api('DELETE', $host, "ai/conversations/{$chat}", $a)->assertNotFound();
        $this->api('DELETE', $host, "ai/conversations/{$chat}", $b)->assertOk();
        Tenancy::as(LearnerRegistrationService::institution(), function () use ($chat, $b) {
            $this->assertNull(AiConversation::find($chat));
            $this->assertSame(0, AiMessage::where('ai_conversation_id', $chat)->count());
            $this->assertSame(1, AiAnswerReveal::where('user_id', $b->id)->count(), 'the free answer stays counted');
        });
        $this->assertNotContains($chat, collect($this->api('GET', $host, 'ai/conversations', $b)->assertOk()->json('data'))->pluck('id')->all(), 'listed no more');
    }

    public function test_students_reach_the_assistant_and_the_super_admin_sets_their_quota(): void
    {
        $this->api('GET', LearnerRegistrationService::host(), 'ai/settings', $this->learner('01744444444'))->assertForbidden();   // the head's setting, not a student's
        $super = $this->makeUser(null, 'super_admin');
        $central = 'admin.' . config('tenancy.base_domain');
        $this->assertSame(20, $this->api('GET', $central, 'super/ai-settings', $super)->json('data.student_free_answers_per_day'));
        $this->api('PUT', $central, 'super/ai-settings', $super, ['free_answers_per_day' => 20, 'daily_question_limit' => null, 'student_free_answers_per_day' => 7])
            ->assertOk()->assertJsonPath('data.student_free_answers_per_day', 7);
        $school = $this->makeInstitution('aistud', 'school');
        $this->api('GET', $this->hostOf($school), 'ai/conversations', $this->makeUser($school, 'student'))->assertOk();   // an institution's student too
        $this->api('GET', $this->hostOf($school), 'ai/conversations', $this->makeUser($school, 'parent'))->assertForbidden();
    }
}
