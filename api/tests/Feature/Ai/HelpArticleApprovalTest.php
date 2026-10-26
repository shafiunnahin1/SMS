<?php

namespace Tests\Feature\Ai;

use App\Models\{AiConversation, AiHelpArticle, AuditLog, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D166 (6) AI-Q4 part 2: the Super Admin panel edits (back to draft) and approves platform articles, and asks the guide itself; an
// institution's head writes and approves its own wording, shown only in that institution; nothing unapproved is shown; every write
// is audited; a teacher cannot approve; another institution's wording is a 404.
class HelpArticleApprovalTest extends TestCase
{
    use RefreshDatabase;

    private const TEXT = ['title' => 'নিজের লেখা: শিক্ষার্থী ভর্তি', 'keywords' => 'শিক্ষার্থী ভর্তি যোগ নতুন', 'body' => ['purpose' => 'নিজস্ব উদ্দেশ্য', 'where' => 'মেনু',
        'steps' => ['এক', 'দুই'], 'result' => 'ফল', 'errors' => ['ভুল'], 'limits' => 'সীমা']];

    public function test_super_admin_edits_approves_and_asks(): void
    {
        $this->artisan('ai:help-seed')->assertSuccessful();
        $central = 'admin.' . config('tenancy.base_domain');
        $sa = User::create(['institution_id' => null, 'name' => 'SA', 'role' => 'super_admin', 'phone' => '01799000019', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $rows = $this->api('GET', $central, 'super/ai-help-articles', $sa)->assertOk()->json('data');
        $this->assertCount(16, $rows);
        $super = collect($rows)->firstWhere(fn ($r) => $r['slug'] === 'super-approve-help' && $r['locale'] === 'bn');

        $this->assertSame('not_found', $this->api('POST', $central, 'super/ai-help', $sa, ['text' => 'নির্দেশনা কীভাবে অনুমোদন করব'])->assertOk()->json('data.kind'), 'a draft is not shown');
        $this->api('POST', $central, "super/ai-help-articles/{$super['id']}/approve", $sa)->assertOk()->assertJsonPath('data.status', 'approved');
        $a = $this->api('POST', $central, 'super/ai-help', $sa, ['text' => 'নির্দেশনা কীভাবে অনুমোদন করব'])->assertOk()->json('data');
        $this->assertSame(['help', $super['id']], [$a['kind'], $a['sources'][0]['id']]);
        $this->assertStringContainsString('অনুমোদন', $a['body']);

        $this->api('PUT', $central, "super/ai-help-articles/{$super['id']}", $sa, ['title' => 'x'])->assertStatus(422);
        $this->api('PUT', $central, "super/ai-help-articles/{$super['id']}", $sa, self::TEXT)->assertOk()->assertJsonPath('data.status', 'draft');
        $this->assertSame('not_found', $this->api('POST', $central, 'super/ai-help', $sa, ['text' => 'নির্দেশনা কীভাবে অনুমোদন করব'])->json('data.kind'), 'an edit returns it to draft');

        $this->api('POST', $central, 'super/ai-help-articles', $sa, self::TEXT + ['slug' => 'x-gone', 'locale' => 'bn', 'roles' => ['admin'], 'routes' => ['POST api/v1/no-such']])->assertStatus(422);
        $new = $this->api('POST', $central, 'super/ai-help-articles', $sa, self::TEXT + ['slug' => 'x-new', 'locale' => 'bn', 'roles' => ['admin'], 'routes' => ['POST api/v1/students']])->assertCreated()->json('data');
        $this->assertSame('draft', $new['status']);
        $this->api('POST', $central, 'super/ai-help-articles', $sa, self::TEXT + ['slug' => 'x-new', 'locale' => 'bn', 'roles' => ['admin']])->assertStatus(422);
        $this->assertSame(3, Tenancy::withoutTenancy(fn () => AuditLog::where('action', 'like', 'ai.help.%')->count()));
    }

    public function test_head_writes_own_wording_shown_only_in_own_institution(): void
    {
        $this->artisan('ai:help-seed')->assertSuccessful();
        Tenancy::withoutTenancy(fn () => AiHelpArticle::query()->update(['status' => 'approved', 'approved_at' => now()]));
        $baseId = Tenancy::withoutTenancy(fn () => AiHelpArticle::where('slug', 'admit-student')->where('locale', 'bn')->value('id'));
        $one = $this->makeInstitution('helpown1', 'school');
        $two = $this->makeInstitution('helpown2', 'school');
        $head = $this->makeUser($one, 'admin');
        $h = $this->hostOf($one);

        $list = $this->api('GET', $h, 'ai/help-articles', $head)->assertOk()->json('data');
        $this->assertNotContains('super-approve-help', array_column($list, 'slug'), 'a Super Admin article is not offered to an institution');
        $teacher = $this->makeUser($one, 'teacher');
        $this->api('GET', $h, 'ai/help-articles', $teacher)->assertForbidden();
        $this->api('POST', $h, 'ai/help-articles', $teacher, self::TEXT + ['base_article_id' => $baseId])->assertForbidden();

        $own = $this->api('POST', $h, 'ai/help-articles', $head, self::TEXT + ['base_article_id' => $baseId])->assertCreated()->json('data');
        $this->assertSame(['draft', ['admin']], [$own['status'], $own['roles']], 'roles come from the platform article');
        $this->api('POST', $h, 'ai/help-articles', $head, self::TEXT + ['base_article_id' => $baseId])->assertStatus(422);

        $ask = function ($u, $i) {
            $id = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $u->id, 'title' => 'x'])->id);
            return $this->api('POST', $this->hostOf($i), "ai/conversations/{$id}/messages", $u, ['text' => 'নতুন শিক্ষার্থী কীভাবে ভর্তি করব?'])->assertCreated()->json('data.answer.body');
        };
        $this->assertStringNotContainsString('নিজস্ব উদ্দেশ্য', $ask($head, $one), 'a draft wording is not shown');
        $this->api('POST', $h, "ai/help-articles/{$own['id']}/approve", $head)->assertOk();
        $this->assertStringContainsString('নিজস্ব উদ্দেশ্য', $ask($head, $one));
        $other = $this->makeUser($two, 'admin');
        $this->assertStringNotContainsString('নিজস্ব উদ্দেশ্য', $ask($other, $two), 'another institution keeps the platform text');

        $this->api('PUT', $this->hostOf($two), "ai/help-articles/{$own['id']}", $other, self::TEXT)->assertNotFound();
        $this->api('POST', $this->hostOf($two), "ai/help-articles/{$own['id']}/approve", $other)->assertNotFound();
        $this->api('PUT', $h, "ai/help-articles/{$own['id']}", $head, self::TEXT)->assertOk()->assertJsonPath('data.status', 'draft');
        $this->assertSame(3, Tenancy::as($one, fn () => AuditLog::where('action', 'like', 'ai.help.%')->count()));
    }
}
