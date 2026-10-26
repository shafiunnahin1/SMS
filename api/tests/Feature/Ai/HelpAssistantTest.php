<?php

namespace Tests\Feature\Ai;

use App\Models\{AiConversation, AiHelpArticle, AiReview, Institution, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D166 (6) AI-Q4: the help guide answers only from approved articles that fit the caller's role, module, institution type and
// language, in the fixed layout, with the article as a "help" source and no review / no free-answer count; a draft, a stale
// article (a route gone), another institution's wording or another role's article is never shown; a workflow question without an
// article and any question from a help-only role (parent, accountant) gets the fixed "no verified information" reply.
class HelpAssistantTest extends TestCase
{
    use RefreshDatabase;

    private function seedArticles(): void
    {
        $this->artisan('ai:help-seed')->expectsOutputToContain('drafts added 16')->assertSuccessful();
        Tenancy::withoutTenancy(fn () => AiHelpArticle::query()->update(['status' => 'approved', 'approved_at' => now()]));
    }

    private function ask(User $u, Institution $i, string $text)
    {
        $id = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $u->id, 'title' => 'x'])->id);
        return $this->api('POST', $this->hostOf($i), "ai/conversations/{$id}/messages", $u, ['text' => $text])->assertCreated()->json('data.answer');
    }

    public function test_role_language_and_layout(): void
    {
        $this->seedArticles();
        $school = $this->makeInstitution('helpsch', 'school');
        $admin = $this->makeUser($school, 'admin');
        $a = $this->ask($admin, $school, 'নতুন শিক্ষার্থী কীভাবে ভর্তি করব?');
        $this->assertSame('help', $a['kind']);
        $this->assertSame('help', $a['sources'][0]['type']);
        foreach (['উদ্দেশ্য', 'কোথায় যাবেন', 'ধাপে ধাপে', 'নতুন ভর্তি', 'সংরক্ষণ', 'আপনার role ও মডিউলের সীমা'] as $part) $this->assertStringContainsString($part, $a['body'], $part);
        $this->assertSame(0, Tenancy::as($school, fn () => AiReview::count()), 'an approved article is not queued for review');

        $admin->forceFill(['locale' => 'en'])->save();
        $en = $this->ask($admin->fresh(), $school, 'How do I add a new student admission?');
        $this->assertStringContainsString('New admission', $en['body']);
        $this->assertStringContainsString('Step by step', $en['body']);

        $teacher = $this->makeUser($school, 'teacher');
        $t = $this->ask($teacher, $school, 'নতুন শিক্ষার্থী কীভাবে ভর্তি করব?');
        $this->assertSame(['not_found', []], [$t['kind'], $t['sources']], 'the admin\'s workflow is not shown to a teacher');
        $this->assertStringContainsString('যাচাই করা তথ্য পাওয়া যায়নি', $t['body']);

        $parent = $this->makeUser($school, 'parent');
        $this->assertSame('help', $this->ask($parent, $school, 'সন্তানের ফলাফল কোথায় দেখব')['kind']);
        $p = $this->ask($parent, $school, '৪ ও ৬ এর লসাগু কত');
        $this->assertSame('not_found', $p['kind'], 'a parent gets the help guide only');
        $this->api('GET', $this->hostOf($school), 'ai/conversations', $this->makeUser($school, 'accountant'))->assertOk();
    }

    public function test_drafts_stale_routes_modules_and_institution_wording(): void
    {
        $this->artisan('ai:help-seed')->assertSuccessful();
        $school = $this->makeInstitution('helpsch2', 'school');
        $admin = $this->makeUser($school, 'admin');
        $this->assertSame('not_found', $this->ask($admin, $school, 'নতুন শিক্ষার্থী কীভাবে ভর্তি করব')['kind'], 'drafts are never shown');

        Tenancy::withoutTenancy(fn () => AiHelpArticle::query()->update(['status' => 'approved']));
        Tenancy::withoutTenancy(fn () => AiHelpArticle::where('slug', 'fee-category')->get()->each(fn ($a) => $a->update(['refs' => ['menus' => [], 'keys' => [], 'routes' => ['POST api/v1/no-such-route']]])));
        $this->assertSame('not_found', $this->ask($admin, $school, 'ফি-র নতুন খাত কীভাবে তৈরি করব')['kind'], 'a stale article fails closed');

        $school->forceFill(['enabled_modules' => array_replace($school->enabled_modules ?? [], ['students' => false])])->save();
        $this->assertSame('not_found', $this->ask($admin, $school->fresh(), 'নতুন শিক্ষার্থী কীভাবে ভর্তি করব')['kind'], 'module off');
        $school->forceFill(['enabled_modules' => array_replace($school->enabled_modules ?? [], ['students' => true])])->save();
        $school = $school->fresh();

        $base = Tenancy::withoutTenancy(fn () => AiHelpArticle::whereNull('institution_id')->where('slug', 'admit-student')->where('locale', 'bn')->sole());
        Tenancy::as($school, fn () => AiHelpArticle::create(['base_article_id' => $base->id, 'slug' => 'admit-student', 'locale' => 'bn', 'title' => 'আমাদের ভর্তির নিয়ম',
            'keywords' => $base->keywords, 'roles' => ['admin'], 'module' => 'students', 'body' => ['purpose' => 'OUR-WORDING'] + $base->body, 'refs' => $base->refs, 'status' => 'approved']));
        $own = $this->ask($admin, $school, 'নতুন শিক্ষার্থী কীভাবে ভর্তি করব');
        $this->assertStringContainsString('OUR-WORDING', $own['body'], 'the institution\'s approved wording replaces the platform article there');
        $other = $this->makeInstitution('helpsch3', 'school');
        $this->assertStringNotContainsString('OUR-WORDING', $this->ask($this->makeUser($other, 'admin'), $other, 'নতুন শিক্ষার্থী কীভাবে ভর্তি করব')['body'], 'and only there');
    }
}
