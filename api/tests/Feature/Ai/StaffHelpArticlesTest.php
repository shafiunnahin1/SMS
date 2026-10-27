<?php

namespace Tests\Feature\Ai;

use App\Models\{AiConversation, AiHelpArticle, Institution, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D168 (3) AI-Q4S: the four first staff articles (admission, fee collection, attendance, student information) load as drafts, are
// shown to nobody until approved, and once approved each reaches only a staff member holding every duty key its routes need.
class StaffHelpArticlesTest extends TestCase
{
    use RefreshDatabase;

    private const ARTICLES = [
        'staff-admit-student' => [['staff.student.store'], 'শিক্ষার্থী কীভাবে ভর্তি করব'],
        'staff-fee-collect' => [['staff.fee.collect'], 'ফি কীভাবে আদায় করব'],
        'staff-attendance' => [['staff.attendance.store'], 'উপস্থিতি কীভাবে নেব'],
        'staff-student-info' => [['staff.student.index', 'staff.student.show'], 'শিক্ষার্থীর তথ্য কীভাবে দেখব'],
    ];

    private function staff(Institution $i, array $keys): User
    {
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $admin = User::where('institution_id', $i->id)->where('role', 'admin')->first() ?? $this->makeUser($i, 'admin');
        $staff = User::create(['institution_id' => $i->id, 'name' => 'Staff', 'role' => 'institution_staff', 'phone' => '0171' . random_int(1000000, 9999999), 'password' => 'Staff-pass-2026', 'is_active' => true]);
        Tenancy::as($i, function () use ($admin, $staff, $keys) {
            $s = app(DepartmentService::class);
            $d = $s->create($admin, ['name' => 'Office ' . $staff->id]);
            $m = $s->addMember($admin, $d->id, ['user_id' => $staff->id]);
            $duty = $s->createDuty($admin, $d->id, ['code' => 'D' . $staff->id, 'name' => 'Work', 'permission_keys' => $keys]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
        });
        return $staff;
    }

    private function ask(User $u, Institution $i, string $text): array
    {
        $this->app['auth']->forgetGuards();
        $id = Tenancy::as($i, fn () => AiConversation::create(['user_id' => $u->id, 'title' => 'x'])->id);
        return $this->api('POST', $this->hostOf($i), "ai/conversations/{$id}/messages", $u, ['text' => $text])->assertCreated()->json('data');
    }

    public function test_the_four_staff_articles_reach_only_staff_with_their_duty_keys(): void
    {
        $this->artisan('ai:help-seed')->assertSuccessful();
        $slugs = array_keys(self::ARTICLES);
        $drafts = Tenancy::withoutTenancy(fn () => AiHelpArticle::whereNull('institution_id')->whereIn('slug', $slugs)->get());
        $this->assertCount(8, $drafts, 'four articles, Bangla and English');
        $this->assertTrue($drafts->every(fn ($a) => $a->status === 'draft' && $a->roles === ['institution_staff']));

        $i = $this->makeInstitution('staffhelp-four', 'school');
        $all = $this->staff($i, ['staff.student.store', 'staff.fee.collect', 'staff.attendance.store', 'staff.student.index', 'staff.student.show']);
        $this->assertSame('not_found', $this->ask($all, $i, self::ARTICLES['staff-fee-collect'][1])['answer']['kind'], 'a draft is shown to nobody');

        Tenancy::withoutTenancy(fn () => AiHelpArticle::whereNull('institution_id')->whereIn('slug', $slugs)->update(['status' => 'approved', 'approved_at' => now()]));
        foreach (self::ARTICLES as $slug => [$keys, $question]) {
            $id = Tenancy::withoutTenancy(fn () => AiHelpArticle::whereNull('institution_id')->where('slug', $slug)->where('locale', 'bn')->value('id'));
            $answer = $this->ask($this->staff($i, $keys), $i, $question)['answer'];
            $this->assertSame('help', $answer['kind'], $slug);
            $this->assertSame($id, $answer['sources'][0]['id'] ?? null, "{$slug}: the matching article with exactly its keys");
            $without = $this->staff($i, $slug === 'staff-fee-collect' ? ['staff.attendance.store'] : ['staff.fee.collect']);
            $this->assertNotSame($id, $this->ask($without, $i, $question)['answer']['sources'][0]['id'] ?? null, "{$slug}: never without its key");
        }
        $partial = $this->staff($i, ['staff.student.index']);
        $info = Tenancy::withoutTenancy(fn () => AiHelpArticle::whereNull('institution_id')->where('slug', 'staff-student-info')->where('locale', 'bn')->value('id'));
        $this->assertNotSame($info, $this->ask($partial, $i, self::ARTICLES['staff-student-info'][1])['answer']['sources'][0]['id'] ?? null, 'every route\'s key is needed');
    }
}
