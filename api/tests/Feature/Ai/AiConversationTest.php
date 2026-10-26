<?php

namespace Tests\Feature\Ai;

use App\Models\{AiAnswerBank, AiConversation};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// D164 AI-P1.1: teachers and the head keep their own chats with the assistant; another user's or another institution's chat is a
// 404; parents and accountants get the help guide (D166 AI-Q4), department staff are refused; the module can be switched off per institution; the answer bank's NULL rows
// are open to all; the question bank and curriculum carry the n-gram FULLTEXT indexes the search needs
class AiConversationTest extends TestCase
{
    use RefreshDatabase;

    public function test_own_chats_only_for_teachers_and_the_head(): void
    {
        $i = $this->makeInstitution('aichat', 'school');
        $host = $this->hostOf($i);
        $admin = $this->makeUser($i, 'admin');
        $teacher = $this->makeUser($i, 'teacher');
        $id = $this->api('POST', $host, 'ai/conversations', $teacher, ['title' => 'লসাগু'])->assertCreated()->json('data.id');
        $this->api('GET', $host, 'ai/conversations', $teacher)->assertOk()->assertJsonPath('data.0.title', 'লসাগু');
        $this->api('GET', $host, "ai/conversations/{$id}", $teacher)->assertOk()->assertJsonPath('data.messages', []);
        $this->api('GET', $host, "ai/conversations/{$id}", $admin)->assertNotFound();           // another user's chat, even the head's view
        $this->api('GET', $host, 'ai/conversations', $admin)->assertOk()->assertJsonCount(0, 'data');
        $this->api('POST', $host, 'ai/conversations', $teacher, ['title' => ''])->assertStatus(422);
        foreach (['accountant', 'parent'] as $role) $this->api('GET', $host, 'ai/conversations', $this->makeUser($i, $role))->assertOk();   // D166 AI-Q4: the help guide
        $this->api('GET', $host, 'ai/conversations', $this->makeUser($i, 'institution_staff'))->assertOk();   // D168 AI-Q4S: staff get the help guide (StaffHelpTest)

        // AI-P1.3: rating an answer in an own chat only
        $answer = Tenancy::as($i, fn () => \App\Models\AiMessage::create(['ai_conversation_id' => $id, 'role' => 'answer', 'body' => 'x'])->id);
        $this->api('PUT', $host, "ai/messages/{$answer}/rating", $teacher, ['rating' => -1])->assertOk()->assertJsonPath('data.rating', -1);
        $this->api('PUT', $host, "ai/messages/{$answer}/rating", $teacher, ['rating' => 5])->assertStatus(422);
        $this->api('PUT', $host, "ai/messages/{$answer}/rating", $admin, ['rating' => 1])->assertNotFound();
        $this->api('PUT', $host, "ai/messages/{$answer}/rating", $teacher, ['rating' => null])->assertOk()->assertJsonPath('data.rating', null);

        $other = $this->makeInstitution('aichat2', 'school');
        $this->api('GET', $this->hostOf($other), "ai/conversations/{$id}", $this->makeUser($other, 'admin'))->assertNotFound();
    }

    public function test_the_module_switches_off_per_institution(): void
    {
        $i = $this->makeInstitution('aichatoff', 'school');
        $i->forceFill(['enabled_modules' => ['ai_assistant' => false]])->save();
        $this->api('GET', $this->hostOf($i), 'ai/conversations', $this->makeUser($i, 'teacher'))->assertForbidden();
    }

    public function test_answer_bank_rows_open_to_all_and_fulltext_indexes_exist(): void
    {
        $i = $this->makeInstitution('aibank', 'school');
        Tenancy::withoutTenancy(fn () => AiAnswerBank::create(['question_text' => 'লসাগু কী', 'answer_text' => 'লঘিষ্ঠ সাধারণ গুণিতক']));
        Tenancy::as($i, fn () => AiAnswerBank::create(['question_text' => 'own', 'answer_text' => 'own']));
        $this->assertSame([null, $i->id], Tenancy::withoutTenancy(fn () => AiAnswerBank::orderBy('id')->pluck('institution_id')->all()));
        foreach (['ai_answer_bank' => 'ft_ai_answer_bank', 'qb_questions' => 'ft_qb_questions_text', 'qb_question_options' => 'ft_qb_question_options_text',
            'qb_creative_parts' => 'ft_qb_creative_parts_text', 'qb_curriculum_nodes' => 'ft_qb_curriculum_nodes_name'] as $table => $index) {
            $this->assertNotEmpty(DB::select("SHOW INDEX FROM {$table} WHERE Key_name = ? AND Index_type = 'FULLTEXT'", [$index]), "{$table}.{$index}");
        }
    }
}
