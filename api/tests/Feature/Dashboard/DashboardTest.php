<?php

namespace Tests\Feature\Dashboard;

use App\Models\{Attendance, FeeCategory, Institution};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// Step 4.7: one summary per role; each role reaches only its own dashboard; Super Admin only on the central host and sees
// every institution (counts only - no tenant rows).
class DashboardTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_each_role_gets_its_own_numbers(): void
    {
        $this->travelTo('2026-10-20 09:00:00');
        $s = $this->school('dash');
        $host = $s['host'];
        Tenancy::as($s['i'], function () use ($s) {
            FeeCategory::create(['name' => 'Tuition', 'amount' => 500, 'frequency' => 'monthly']);
            Attendance::create(['student_id' => $s['mine']->id, 'batch_id' => $s['a']->id, 'program_id' => $s['p']->id, 'date' => '2026-10-20', 'status' => 'absent']);
            Attendance::create(['student_id' => $s['other']->id, 'batch_id' => $s['a']->id, 'program_id' => $s['p']->id, 'date' => '2026-10-20', 'status' => 'present']);
        });
        $examId = $this->exam($s);
        $keys = array_column($this->api('GET', $host, "fees/dues?student_id={$s['other']->id}", $s['admin'])->json('data.lines'), 'key');
        $this->api('POST', $host, 'fees/collect', $s['admin'], ['student_id' => $s['other']->id, 'payment_method' => 'cash', 'lines' => [['key' => $keys[0]]]])->assertCreated();

        $admin = $this->api('GET', $host, 'admin/dashboard', $s['admin'])->assertOk()->json('data');
        $this->assertSame([3, 2, 2], [$admin['students'], $admin['teachers'], $admin['batches']]);
        $this->assertSame(['present' => 1, 'absent' => 1, 'leave' => 0, 'batches_taken' => 1, 'batches_total' => 2], $admin['attendance_today']);
        $this->assertSame(['500.00', '500.00', 1], [$admin['collection']['today'], $admin['collection']['month'], $admin['collection']['receipts_today']]);
        $this->assertSame(1, $admin['exams_open']);

        $accountant = $this->makeUser($s['i'], 'accountant');
        $acc = $this->api('GET', $host, 'accountant/dashboard', $accountant)->assertOk()->json('data');
        $this->assertSame(['500.00', 'Other'], [$acc['recent_receipts'][0]['total'], $acc['recent_receipts'][0]['student']]);

        // Karim is Bangla's subject teacher, in charge of no batch: no batches, Bangla waiting for marks
        $teacher = $this->api('GET', $host, 'teacher/dashboard', $s['karimUser'])->assertOk()->json('data');
        $this->assertSame([], $teacher['batches']);
        $this->assertSame([[$examId, 'বাংলা']], array_map(fn ($p) => [$p['exam_id'], $p['subject']], $teacher['marks_pending']));

        $parent = $this->api('GET', $host, 'parent/dashboard', $s['parent'])->assertOk()->json('data');
        $this->assertSame(['Mine', 'Sister'], array_column($parent, 'name'));
        $this->assertSame([1, 1, 0], [$parent[0]['attendance']['days'], $parent[0]['attendance']['absent'], $parent[0]['attendance']['percentage']]);
        $this->assertSame(['count' => 1, 'total' => '500.00'], $parent[0]['dues']);
        $this->assertNull($parent[0]['latest_result'], 'nothing published yet');

        foreach (['admin' => $accountant, 'accountant' => $s['admin'], 'teacher' => $s['parent'], 'parent' => $s['karimUser']] as $panel => $wrong) {
            $this->api('GET', $host, "{$panel}/dashboard", $wrong)->assertForbidden();
        }
    }

    public function test_super_admin_counts_every_institution_on_the_central_host_only(): void
    {
        $this->makeInstitution('sa1', 'school');
        $this->makeInstitution('sa2', 'coaching', 'trial');
        $suspended = $this->makeInstitution('sa3', 'coaching', 'suspended');
        $suspended->forceFill(['subscription_expires_at' => now()->addDays(3)])->save();
        $super = $this->makeUser(null, 'super_admin');
        $central = 'admin.' . config('tenancy.base_domain');

        $d = $this->api('GET', $central, 'super/dashboard', $super)->assertOk()->json('data');
        $this->assertSame([3, 1, 1, 1], [$d['institutions']['total'], $d['institutions']['by_status']['active'], $d['institutions']['by_status']['trial'], $d['institutions']['by_status']['suspended']]);
        $this->assertEquals(['school' => 1, 'coaching' => 2], $d['by_type']);
        $this->assertSame(['sa3'], array_column($d['expiring_7_days'], 'slug'));
        $this->assertSame(3, $d['signups_30_days']);

        $this->api('GET', $this->hostOf(Institution::where('slug', 'sa1')->first()), 'super/dashboard', $super)->assertNotFound();
        $this->api('GET', $central, 'super/dashboard', $this->makeUser(Institution::where('slug', 'sa1')->first(), 'admin'))->assertForbidden();
    }
}
