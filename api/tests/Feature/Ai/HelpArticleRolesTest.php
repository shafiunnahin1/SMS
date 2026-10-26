<?php

namespace Tests\Feature\Ai;

use App\Models\{AiConversation, AiHelpArticle, User, Institution};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D166 AI-Q4: the assign-teacher article is the head's only; the question-paper article reaches the head and teachers, and only
// while the question bank module is on; parents never see either.
class HelpArticleRolesTest extends TestCase
{
    use RefreshDatabase;

    private function ask(User $u, Institution $i, string $text): array
    {
        $id = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $u->id, 'title' => 'x'])->id);
        return $this->api('POST', $this->hostOf($i), "ai/conversations/{$id}/messages", $u, ['text' => $text])->assertCreated()->json('data.answer');
    }

    private function slug(array $a): ?string
    {
        $id = collect($a['sources'])->firstWhere('type', 'help')['id'] ?? null;
        return $id ? Tenancy::withoutTenancy(fn () => AiHelpArticle::find($id)?->slug) : null;
    }

    public function test_assign_teacher_and_question_paper_by_role_and_module(): void
    {
        $this->artisan('ai:help-seed')->assertSuccessful();
        Tenancy::withoutTenancy(fn () => AiHelpArticle::query()->update(['status' => 'approved', 'approved_at' => now()]));
        $i = $this->makeInstitution('helproles', 'school');
        $admin = $this->makeUser($i, 'admin');
        $teacher = $this->makeUser($i, 'teacher');
        $parent = $this->makeUser($i, 'parent');

        $this->assertSame('assign-teacher', $this->slug($this->ask($admin, $i, 'শিক্ষককে বিষয়ে কীভাবে যুক্ত করব')));
        $this->assertNotSame('assign-teacher', $this->slug($this->ask($teacher, $i, 'শিক্ষককে বিষয়ে কীভাবে যুক্ত করব')), 'a teacher does not get the head\'s workflow');
        $this->assertSame('question-paper', $this->slug($this->ask($teacher, $i, 'প্রশ্নপত্র কীভাবে তৈরি করব')));
        $this->assertSame('question-paper', $this->slug($this->ask($admin, $i, 'প্রশ্নপত্র কীভাবে তৈরি করব')));
        $this->assertNull($this->slug($this->ask($parent, $i, 'প্রশ্নপত্র কীভাবে তৈরি করব')));

        $i->forceFill(['enabled_modules' => array_replace($i->enabled_modules ?? [], ['question_bank' => false])])->save();
        $this->assertNull($this->slug($this->ask($teacher, $i->fresh(), 'প্রশ্নপত্র কীভাবে তৈরি করব')), 'question bank off: no question-paper article');
    }
}
