<?php

namespace Tests\Feature\Access;

use App\Models\{AuditLog, TeacherFeatureOverride};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D205 PERM.1: the admin switches teacher features off for every teacher and, as exceptions, off or back on for one teacher; a
// switched-off feature answers 403 `feature_off` on its routes for that teacher only; never-switchable routes stay open; other
// roles are not touched; another institution's teacher is 404; every change is audited.
class TeacherFeatureTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_switches_for_all_and_for_one(): void
    {
        $s = $this->school('tfeat');
        $o = $this->school('tfeat2');
        $h = $s['host'];
        $karim = $s['karimUser'];
        $other = $s['otherUser'];

        // nothing off yet
        $this->api('GET', $h, 'teacher/features', $karim)->assertOk()->assertJsonPath('data.off', []);
        $this->api('GET', $h, 'notices', $karim)->assertOk();
        $this->api('GET', $h, 'admin/teacher-features', $s['admin'])->assertOk()->assertJsonCount(11, 'data.features');

        // the institution switches notices and referrals off for every teacher
        $this->api('PUT', $h, 'admin/teacher-features', $s['admin'], ['off' => ['notices', 'nonsense']])->assertStatus(422);
        $this->api('PUT', $h, 'admin/teacher-features', $karim, ['off' => ['notices']])->assertForbidden();
        $this->api('PUT', $h, 'admin/teacher-features', $s['admin'], ['off' => ['referrals', 'notices']])->assertOk()->assertJsonPath('data.off', ['referrals', 'notices']);
        foreach ([$karim, $other] as $t) {
            $this->api('GET', $h, 'notices', $t)->assertForbidden()->assertJsonPath('error', 'feature_off')->assertJsonPath('feature', 'notices');
            $this->api('POST', $h, 'referrals', $t, ['name' => 'X', 'phone' => '01711223344'])->assertForbidden()->assertJsonPath('error', 'feature_off');
        }
        // never switchable, and other roles untouched
        $this->api('GET', $h, 'teacher/dashboard', $karim)->assertOk();
        $this->api('GET', $h, 'teacher/batches', $karim)->assertOk();
        $this->api('GET', $h, 'notices', $s['parent'])->assertOk();
        $this->api('GET', $h, 'notices', $s['admin'])->assertOk();

        // exceptions for one teacher: notices back on for Karim; attendance off for Karim only
        $this->api('PUT', $h, "admin/users/{$karim->id}/teacher-features", $s['admin'], ['overrides' => ['bogus' => 'blocked']])->assertStatus(422);
        $this->api('PUT', $h, "admin/users/{$karim->id}/teacher-features", $s['admin'], ['overrides' => ['notices' => 'maybe']])->assertStatus(422);
        $this->api('PUT', $h, "admin/users/{$karim->id}/teacher-features", $s['admin'], ['overrides' => ['notices' => 'allowed', 'attendance' => 'blocked']])
            ->assertOk()->assertJsonPath('data.off', ['attendance', 'referrals'])->assertJsonPath('data.institution_off', ['referrals', 'notices']);
        $this->api('GET', $h, 'teacher/features', $karim)->assertJsonPath('data.off', ['attendance', 'referrals']);
        $this->api('GET', $h, 'notices', $karim)->assertOk();
        $this->api('GET', $h, 'attendance?batch_id=' . $s['a']->id . '&date=2030-01-01', $karim)->assertForbidden()->assertJsonPath('feature', 'attendance');
        $this->api('GET', $h, 'notices', $other)->assertForbidden();
        $this->assertNotSame('feature_off', $this->api('GET', $h, 'attendance?batch_id=' . $s['a']->id . '&date=2030-01-01', $other)->json('error'));   // only Karim's exception

        // removing an exception goes back to the institution's rule
        $this->api('PUT', $h, "admin/users/{$karim->id}/teacher-features", $s['admin'], ['overrides' => ['notices' => null]])->assertOk()->assertJsonPath('data.off', ['attendance', 'referrals', 'notices']);
        $this->assertSame(1, Tenancy::as($s['i'], fn () => TeacherFeatureOverride::where('user_id', $karim->id)->count()));

        // only teachers of this institution; the switches are the admin's
        $this->api('GET', $h, "admin/users/{$s['admin']->id}/teacher-features", $s['admin'])->assertNotFound();
        $this->api('GET', $h, "admin/users/{$o['karimUser']->id}/teacher-features", $s['admin'])->assertNotFound();
        $this->api('GET', $h, "admin/users/{$karim->id}/teacher-features", $karim)->assertForbidden();
        $this->api('GET', $o['host'], 'notices', $o['karimUser'])->assertOk();                      // the other institution is untouched

        // audited with ids and keys only
        $this->assertSame(3, Tenancy::as($s['i'], fn () => AuditLog::where('action', 'like', 'teacher_features.%')->count()));
    }
}
