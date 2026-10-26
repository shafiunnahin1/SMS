<?php

namespace Tests\Feature\Ai;

use App\Models\{AiConversation, AiHelpArticle, DepartmentMembership, Institution, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D168 AI-Q4S: department staff use their own AI chat for the help guide only. An approved staff article is shown only if every
// route it names is catalogued exact_duty_permission and the staff member holds that key in ANY active department; a missing key,
// an inactive membership, a principal-only route, no route at all or an article for another role is never shown. The head's
// settings and help-article pages stay admin-only; another user's chat is a 404; the module off closes the chat.
class StaffHelpTest extends TestCase
{
    use RefreshDatabase;

    private function article(string $slug, string $title, array $routes, array $roles = ['institution_staff']): void
    {
        Tenancy::withoutTenancy(fn () => AiHelpArticle::create(['institution_id' => null, 'slug' => $slug, 'locale' => 'bn', 'title' => $title, 'keywords' => $title,
            'roles' => $roles, 'module' => null, 'body' => ['purpose' => "{$slug}-PURPOSE", 'where' => 'x', 'steps' => ['x'], 'result' => 'x', 'errors' => ['x'], 'limits' => 'x'],
            'refs' => ['menus' => [], 'keys' => [], 'routes' => $routes], 'status' => 'approved', 'approved_at' => now()]));
    }

    private function staff(Institution $i, User $admin, array $keys): User
    {
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $staff = $this->makeUser($i, 'institution_staff');
        Tenancy::as($i, function () use ($admin, $staff, $keys) {
            $s = app(DepartmentService::class);
            $other = $s->create($admin, ['name' => 'Front office']);   // a department without the key: "any department" still finds the one with it
            $s->addMember($admin, $other->id, ['user_id' => $staff->id]);
            $d = $s->create($admin, ['name' => 'Academic']);
            $m = $s->addMember($admin, $d->id, ['user_id' => $staff->id]);
            $duty = $s->createDuty($admin, $d->id, ['code' => 'ATT', 'name' => 'Attendance', 'permission_keys' => $keys]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
        });
        return $staff;
    }

    private function ask(User $u, Institution $i, string $text): array
    {
        $this->app['auth']->forgetGuards();
        $id = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $u->id, 'title' => 'x'])->id);
        return $this->api('POST', $this->hostOf($i), "ai/conversations/{$id}/messages", $u, ['text' => $text])->assertCreated()->json('data.answer');
    }

    public function test_staff_see_only_articles_their_duties_allow(): void
    {
        $i = $this->makeInstitution('staffhelp', 'school');
        $admin = $this->makeUser($i, 'admin');
        $staff = $this->staff($i, $admin, ['staff.attendance.store']);
        $this->article('st-attendance', 'হাজিরা নেওয়া', ['POST api/v1/attendance']);
        $this->article('st-admit', 'শিক্ষার্থী ভর্তি', ['POST api/v1/students']);                       // a key the staff member lacks
        $this->article('st-anonymize', 'শিক্ষার্থীর তথ্য মুছে ফেলা', ['POST api/v1/students/{id}/anonymize']);   // principal only
        $this->article('st-norefs', 'বেতন দেখা', []);                                                   // names no route
        $this->article('ad-fee', 'ফি আদায় করা', ['POST api/v1/fees/collect'], ['admin']);             // another role's article

        $a = $this->ask($staff, $i, 'হাজিরা কীভাবে নেব');
        $this->assertSame('help', $a['kind']);
        $this->assertStringContainsString('st-attendance-PURPOSE', $a['body']);
        foreach (['শিক্ষার্থী কীভাবে ভর্তি করব', 'শিক্ষার্থীর তথ্য কীভাবে মুছে ফেলা যায়', 'বেতন কোথায় দেখা যায়', 'ফি কীভাবে আদায় করব'] as $q) {
            $this->assertSame('not_found', $this->ask($staff, $i, $q)['kind'], $q);
        }
        $this->assertSame('not_found', $this->ask($staff, $i, 'সময়ের সাথে বেগের পরিবর্তনের হার কী')['kind'], 'staff get the help guide only');

        $j = $this->makeInstitution('staffhelp3', 'school');
        $admitter = $this->staff($j, $this->makeUser($j, 'admin'), ['staff.student.store']);
        $this->assertStringContainsString('st-admit-PURPOSE', $this->ask($admitter, $j, 'শিক্ষার্থী কীভাবে ভর্তি করব')['body'], 'the same question with the key shows it');

        Tenancy::as($i, fn () => DepartmentMembership::where('user_id', $staff->id)->update(['status' => 'inactive']));
        $this->assertSame('not_found', $this->ask($staff, $i, 'হাজিরা কীভাবে নেব')['kind'], 'no active membership, no article');
    }

    public function test_staff_boundaries(): void
    {
        $i = $this->makeInstitution('staffhelp2', 'school');
        $admin = $this->makeUser($i, 'admin');
        $staff = $this->staff($i, $admin, ['staff.attendance.store']);
        $h = $this->hostOf($i);
        $this->api('GET', $h, 'ai/conversations', $staff)->assertOk();
        $this->api('GET', $h, 'ai/settings', $staff)->assertForbidden();
        $this->api('GET', $h, 'ai/help-articles', $staff)->assertForbidden();
        $theirs = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $admin->id, 'title' => 'x'])->id);
        $this->api('GET', $h, "ai/conversations/{$theirs}", $staff)->assertNotFound();
        $this->api('POST', $h, "ai/conversations/{$theirs}/messages", $staff, ['text' => 'হাজিরা'])->assertNotFound();
        $this->api('DELETE', $h, "ai/conversations/{$theirs}", $staff)->assertNotFound();

        $i->forceFill(['enabled_modules' => array_replace($i->enabled_modules ?? [], ['ai_assistant' => false])])->save();
        $this->app['auth']->forgetGuards();
        $this->assertContains($this->api('GET', $h, 'ai/conversations', $staff)->status(), [403, 404], 'module off closes the chat');
    }
}
