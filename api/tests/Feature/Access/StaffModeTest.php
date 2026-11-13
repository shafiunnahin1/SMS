<?php

namespace Tests\Feature\Access;

use App\Models\{AuditLog, Teacher};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D207 MODE.1: the admin sees every teacher / accountant / staff account with its review state, reviews each one, switches to
// department mode only when D101 allows it, and switching back ends those accounts' sessions; admin only; audited.
class StaffModeTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_review_then_switch_and_back(): void
    {
        $s = $this->school('smode');
        $h = $s['host'];
        $acct = $this->makeUser($s['i'], 'accountant');

        $d = $this->api('GET', $h, 'admin/staff-mode', $s['admin'])->assertOk()->json('data');
        $this->assertSame('legacy', $d['mode']);
        $this->assertSame(3, $d['summary']['users']);               // two teachers and the accountant
        $this->assertSame(0, $d['summary']['reviewed']);
        $this->api('GET', $h, 'admin/staff-mode', $s['karimUser'])->assertForbidden();

        // not before every account is reviewed (D101)
        $this->api('PUT', $h, 'admin/staff-mode', $s['admin'], ['mode' => 'department'])->assertStatus(422);
        $this->api('PUT', $h, 'admin/staff-mode', $s['admin'], ['mode' => 'other'])->assertStatus(422);

        // review each account, linking the teachers to their own profiles
        foreach ([$s['karimUser'], $s['otherUser']] as $t) {
            $tid = Tenancy::as($s['i'], fn () => Teacher::where('user_id', $t->id)->value('id'));
            $this->api('POST', $h, 'admin/staff-mode/reviews', $s['admin'], ['user_id' => $t->id, 'teacher_id' => $tid, 'decision' => 'keep'])->assertCreated();
        }
        $this->api('POST', $h, 'admin/staff-mode/reviews', $s['admin'], ['user_id' => $s['parent']->id, 'decision' => 'keep'])->assertNotFound();   // not in scope
        $this->api('POST', $h, 'admin/staff-mode/reviews', $s['karimUser'], ['user_id' => $acct->id, 'decision' => 'keep'])->assertForbidden();
        $this->api('POST', $h, 'admin/staff-mode/reviews', $s['admin'], ['user_id' => $acct->id, 'decision' => 'keep', 'note' => 'accounts'])->assertCreated();
        $this->assertSame(3, $this->api('GET', $h, 'admin/staff-mode', $s['admin'])->json('data.summary.reviewed'));

        // now the switch works
        $this->api('PUT', $h, 'admin/staff-mode', $s['admin'], ['mode' => 'department'])->assertOk()->assertJsonPath('data.mode', 'department');
        $this->assertSame('department', $s['i']->fresh()->staff_department_mode);

        // back to legacy ends those accounts' sessions (D101)
        $s['karimUser']->createToken('phone');
        $this->api('PUT', $h, 'admin/staff-mode', $s['admin'], ['mode' => 'legacy'])->assertOk()->assertJsonPath('data.mode', 'legacy');
        $this->assertSame(0, $s['karimUser']->tokens()->count());
        $this->assertSame(2, Tenancy::as($s['i'], fn () => AuditLog::where('action', 'staff_mode.switched')->count()));
        $this->assertSame(3, Tenancy::as($s['i'], fn () => AuditLog::where('action', 'staff_mode.reviewed')->count()));
    }
}
