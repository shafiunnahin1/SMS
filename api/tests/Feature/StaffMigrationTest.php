<?php

namespace Tests\Feature;

use App\Models\{DepartmentDutyAssignment, DepartmentMembership, StaffMappingReview, StaffMember, Teacher, User};
use App\Models\Institution;
use App\Services\{LegacyStaffMappingDryRunService, StaffDepartmentModeService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

// R3.6b (D90, staff-account-contract.md): the legacy mapping is report-only - it writes nothing, turns no role or
// department text into duties, reports ambiguous/invalid links as unresolved and preserves every HR identifier.
class StaffMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function user($i, string $role, string $tag): User
    {
        return User::create(['institution_id' => $i->id, 'name' => $tag, 'email' => "$tag-{$i->slug}@example.test", 'password' => 'Secret@1234', 'role' => $role, 'is_active' => true]);
    }

    private function fixture(): array
    {
        $i = $this->makeInstitution('legacy-map'); $other = $this->makeInstitution('legacy-other');
        $teacher = $this->user($i, 'teacher', 'teacher'); $accountant = $this->user($i, 'accountant', 'accountant');
        $twice = $this->user($i, 'teacher', 'twice'); $parent = $this->user($i, 'parent', 'parent'); $staff = $this->user($i, 'institution_staff', 'staff');
        $foreign = $this->user($other, 'teacher', 'foreign');
        Tenancy::as($i, function () use ($teacher, $accountant, $twice, $parent, $staff, $foreign) {
            Teacher::create(['user_id' => $teacher->id, 'employee_id' => 'T-1', 'designation' => 'Senior Teacher', 'department' => 'Science']);
            StaffMember::create(['user_id' => $accountant->id, 'employee_id' => 'S-1', 'name' => 'Accountant', 'designation' => 'Accountant']);
            Teacher::create(['user_id' => $twice->id, 'employee_id' => 'T-2']);
            Teacher::create(['user_id' => $twice->id, 'employee_id' => 'T-3']);
            Teacher::create(['user_id' => null, 'employee_id' => 'T-4', 'department' => 'Arts']);
            Teacher::create(['user_id' => $parent->id, 'employee_id' => 'T-5']);
            StaffMember::create(['user_id' => $foreign->id, 'employee_id' => 'S-2', 'name' => 'Foreign link']);
            Teacher::create(['user_id' => $staff->id, 'employee_id' => 'T-6', 'designation' => 'Lecturer']);
            StaffMember::create(['user_id' => $staff->id, 'employee_id' => 'S-3', 'name' => 'Same person', 'designation' => 'Clerk']);
        });
        return compact('i', 'other', 'teacher', 'accountant', 'twice', 'parent', 'staff', 'foreign');
    }

    private function cleanFixture(string $slug): array
    {
        $i = $this->makeInstitution($slug);
        $admin = $this->user($i, 'admin', $slug.'-admin');
        $teacher = $this->user($i, 'teacher', $slug.'-teacher');
        $accountant = $this->user($i, 'accountant', $slug.'-accountant');
        Tenancy::as($i, function () use ($teacher, $accountant) {
            Teacher::create(['user_id' => $teacher->id, 'employee_id' => 'T-CLEAN']);
            StaffMember::create(['user_id' => $accountant->id, 'employee_id' => 'S-CLEAN', 'name' => 'Accountant']);
        });
        return compact('i', 'admin', 'teacher', 'accountant');
    }

    private function snapshot(): array
    {
        $out = [];
        foreach (['users', 'teachers', 'staff_members', 'department_memberships', 'department_duty_assignments', 'audit_logs'] as $table) {
            $out[$table] = DB::table($table)->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
        }
        return $out;
    }

    public function test_the_dry_run_writes_nothing_and_grants_nothing(): void
    {
        $f = $this->fixture(); $before = $this->snapshot();
        $service = app(LegacyStaffMappingDryRunService::class);
        $first = Tenancy::as($f['i'], fn () => $service->report());
        $second = Tenancy::as($f['i'], fn () => $service->report());
        $this->assertSame($first, $second, 'repeatable');
        $this->assertSame($before, $this->snapshot(), 'no row is created, changed or deleted');
        $this->assertSame(0, Tenancy::as($f['i'], fn () => DepartmentMembership::count() + DepartmentDutyAssignment::count()));
        $this->assertTrue($first['dry_run']);
        $this->assertFalse($first['summary']['switch_ready']);
        foreach ($first['users'] as $row) $this->assertSame([], $row['proposed_duties'], 'role labels and department text never become duties');
        $this->artisan('staff:mapping-dry-run', ['institution' => 'legacy-map'])->assertSuccessful();
        $this->assertSame($before, $this->snapshot(), 'the command is read-only too');
    }

    public function test_links_are_reported_with_identifiers_preserved_and_collisions_fail_closed(): void
    {
        $f = $this->fixture();
        $report = Tenancy::as($f['i'], fn () => app(LegacyStaffMappingDryRunService::class)->report());
        $users = collect($report['users'])->keyBy('user_id');

        $this->assertSame([$f['teacher']->id, $f['accountant']->id, $f['twice']->id, $f['staff']->id], array_keys($users->all()), 'parents and other tenants are out of scope');
        $t = $users[$f['teacher']->id];
        $this->assertSame([], $t['issues']);
        $this->assertSame(['T-1', 'Senior Teacher', 'Science'], [$t['teachers'][0]['employee_id'], $t['teachers'][0]['designation'], $t['teachers'][0]['department_text']]);
        $this->assertTrue($t['needs_principal_review'], 'legacy department text needs principal review');
        $this->assertSame(['S-1', 'Accountant'], [$users[$f['accountant']->id]['staff_members'][0]['employee_id'], $users[$f['accountant']->id]['staff_members'][0]['designation']]);
        $this->assertFalse($users[$f['accountant']->id]['needs_principal_review']);
        $this->assertSame(['ambiguous_teacher_link'], $users[$f['twice']->id]['issues']);
        $both = $users[$f['staff']->id];
        $this->assertSame([[], ['T-6'], ['S-3']], [$both['issues'], array_column($both['teachers'], 'employee_id'), array_column($both['staff_members'], 'employee_id')], 'one Teacher and one StaffMember on one login stay separate');

        $profiles = collect($report['profiles_without_valid_login'])->keyBy('employee_id');
        $this->assertSame('unlinked_profile', $profiles['T-4']['issue']);
        $this->assertSame('link_to_non_staff_role', $profiles['T-5']['issue']);
        $this->assertSame('link_outside_tenant_or_missing', $profiles['S-2']['issue']);
        $this->assertSame(1, $report['summary']['unlinked_profiles']);
        $this->assertSame(3, $report['summary']['unresolved_identity_collisions'], 'one ambiguous user, one non-staff link, one foreign link');
        $this->assertFalse($report['summary']['switch_ready']);
    }

    public function test_the_command_refuses_an_unknown_institution(): void
    {
        $this->artisan('staff:mapping-dry-run', ['institution' => 'nope'])->assertFailed();
    }

    public function test_review_rows_are_tenant_scoped_append_only_and_institutions_default_to_legacy_mode(): void
    {
        $f = $this->fixture(); $admin = $this->user($f['i'], 'admin', 'admin-review');
        $review = Tenancy::as($f['i'], fn () => app(StaffDepartmentModeService::class)->recordReview(
            $admin, $f['teacher'], Teacher::where('user_id', $f['teacher']->id)->value('id'), null, 'confirmed', 'Identity checked',
        ));

        $this->assertSame('legacy', $f['i']->fresh()->staff_department_mode);
        $this->assertSame(1, Tenancy::as($f['i'], fn () => StaffMappingReview::count()));
        $this->assertSame(0, Tenancy::as($f['other'], fn () => StaffMappingReview::count()));
        $this->expectException(\LogicException::class);
        $review->update(['decision' => 'changed']);
    }

    public function test_department_mode_requires_clean_dry_run_and_a_review_for_every_legacy_account(): void
    {
        $f = $this->fixture(); $admin = $this->user($f['i'], 'admin', 'admin-switch');
        $service = app(StaffDepartmentModeService::class);

        try {
            Tenancy::as($f['i'], fn () => $service->switchMode($admin, 'department'));
            $this->fail('identity collisions must block rollout');
        } catch (\Illuminate\Validation\ValidationException $exception) {
            $this->assertArrayHasKey('mapping', $exception->errors());
        }
        $this->assertSame('legacy', $f['i']->fresh()->staff_department_mode);

        $f = $this->cleanFixture('clean-mode-switch');
        Tenancy::as($f['i'], function () use ($f, $service) {
            foreach ([$f['teacher'], $f['accountant']] as $user) {
                $teacherId = Teacher::where('user_id', $user->id)->value('id');
                $staffId = StaffMember::where('user_id', $user->id)->value('id');
                $service->recordReview($f['admin'], $user, $teacherId, $staffId, 'confirmed');
            }
            $this->assertSame('department', $service->switchMode($f['admin'], 'department')->staff_department_mode);
        });

        $this->assertSame('department', $f['i']->fresh()->staff_department_mode);
        $this->assertNotNull($f['i']->fresh()->switched_at);
    }

    public function test_department_mode_refuses_an_incomplete_review_set(): void
    {
        $f = $this->cleanFixture('incomplete-mode-switch');
        $service = app(StaffDepartmentModeService::class);
        Tenancy::as($f['i'], fn () => $service->recordReview($f['admin'], $f['teacher'], null, null, 'reviewed'));

        try {
            Tenancy::as($f['i'], fn () => $service->switchMode($f['admin'], 'department'));
            $this->fail('every in-scope user must have a review');
        } catch (\Illuminate\Validation\ValidationException $exception) {
            $this->assertArrayHasKey('mapping', $exception->errors());
        }
        $this->assertSame('legacy', $f['i']->fresh()->staff_department_mode);
    }

    public function test_switching_back_to_legacy_revokes_legacy_sessions_without_changing_review_history(): void
    {
        $f = $this->cleanFixture('clean-mode-rollback'); $admin = $f['admin'];
        $service = app(StaffDepartmentModeService::class);
        Tenancy::as($f['i'], function () use ($f, $admin, $service) {
            foreach ([$f['teacher'], $f['accountant']] as $user) {
                $service->recordReview($admin, $user, null, null, 'reviewed');
            }
            $this->assertSame(0, Tenancy::as($f['i'], fn () => app(LegacyStaffMappingDryRunService::class)->report()['summary']['unresolved_identity_collisions']));
            $service->switchMode($admin, 'department');
            $f['teacher']->createToken('rollback-test');
            $this->assertSame(1, $f['teacher']->tokens()->count());
            $service->switchMode($admin, 'legacy');
            $this->assertSame(0, $f['teacher']->tokens()->count());
            $this->assertSame(2, StaffMappingReview::count());
            $this->assertSame('legacy', Institution::find($f['i']->id)->staff_department_mode);
        });
    }
}
