<?php

namespace Tests\Feature\Security;

use App\Models\{Institution, Teacher, User};
use App\Services\DepartmentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Queue, Route};
use Tests\TestCase;

// docs/TESTING.md "RoleMatrixContractTest" (Step 8.2): every authenticated route x the six roles (+ the two D65 writer roles), against tests/Fixtures/role-matrix.php
// (docs/SECURITY.md as data). A role the matrix does not allow gets 403; an allowed role never gets 403 (nor a 500) - with
// placeholder ids it may well be 404 / 422, which is fine: the door opened. A route missing from the matrix fails the test.
class RoleMatrixContractTest extends TestCase
{
    use RefreshDatabase;

    private const ROLES = ['super_admin', 'admin', 'teacher', 'accountant', 'parent', 'student', 'content_writer', 'content_moderator'];
    private const PARAMS = ['{id}' => '999999', '{studentId}' => '999999', '{subjectId}' => '999999', '{institutionId}' => '999999',
        '{type}' => 'students', '{kind}' => 'students', '{action}' => 'dry-run'];

    private static function matrix(): array { return require base_path('tests/Fixtures/role-matrix.php'); }

    /** "METHOD uri" of every route behind auth:sanctum, except the any-host /auth/me and /auth/logout */
    private static function authRoutes(): array
    {
        $out = [];
        foreach (Route::getRoutes()->getRoutes() as $r) {
            $mw = $r->gatherMiddleware();
            if (!in_array('auth:sanctum', $mw, true) || in_array('host.user', $mw, true)) continue;
            foreach (array_diff($r->methods(), ['HEAD']) as $m) $out[] = "{$m} {$r->uri()}";
        }
        sort($out);
        return $out;
    }

    public function test_the_matrix_lists_exactly_the_authenticated_routes(): void
    {
        $keys = array_keys(self::matrix());
        sort($keys);
        $this->assertSame([], array_values(array_diff(self::authRoutes(), $keys)), 'add these routes to tests/Fixtures/role-matrix.php');
        $this->assertSame([], array_values(array_diff($keys, self::authRoutes())), 'stale rows in the matrix');
        foreach (self::matrix() as $key => $roles) {
            $knownRoles = in_array($key, ['GET api/v1/teachers', 'GET api/v1/teacher/salary/advances', 'GET api/v1/teacher/dashboard', 'GET api/v1/accountant/dashboard', 'GET api/v1/sms-logs', 'GET api/v1/accountant/reports/{type}', 'GET api/v1/hr/people/{type}/{id}/salary', 'GET api/v1/attendance', 'POST api/v1/attendance', 'GET api/v1/attendance/report', 'GET api/v1/attendance/summary/{id}', 'PUT api/v1/attendance/{id}', 'GET api/v1/exams/{id}/subjects/{subjectId}/entry', 'GET api/v1/results', 'POST api/v1/results/bulk', 'GET api/v1/results/marksheet/{studentId}', 'PUT api/v1/results/{id}'], true) || str_contains($key, ' api/v1/inventory/') || (str_contains($key, ' api/v1/question-bank/') && !str_ends_with($key, '/spending') && !str_ends_with($key, '/caps'))
                || in_array($key, ['GET api/v1/expenses', 'POST api/v1/expenses', 'GET api/v1/expenses/report', 'GET api/v1/expenses/{id}', 'PUT api/v1/expenses/{id}', 'DELETE api/v1/expenses/{id}', 'GET api/v1/cashbook', 'GET api/v1/cashbook/range', 'POST api/v1/cashbook/{date}/close', 'GET api/v1/cashbook/{date}/report.{ext}', 'POST api/v1/fees/collect', 'GET api/v1/fees/dues', 'GET api/v1/fees/receipt/{id}', 'GET api/v1/fees/payments', 'GET api/v1/fees/payments/student/{id}', 'GET api/v1/fee-refunds/refundable', 'GET api/v1/fee-refunds', 'POST api/v1/fee-refunds', 'GET api/v1/fee-refunds/{id}', 'POST api/v1/fee-refunds/{id}/{action}', 'GET api/v1/hr/adjustments', 'POST api/v1/hr/adjustments', 'GET api/v1/hr/adjustments/suggest-extra-class', 'GET api/v1/hr/advances', 'POST api/v1/hr/advances', 'GET api/v1/hr/advances/{id}', 'GET api/v1/hr/bonus-schemes', 'POST api/v1/hr/bonus-schemes', 'DELETE api/v1/hr/bonus-schemes/{id}', 'GET api/v1/hr/bonus-schemes/{id}', 'PUT api/v1/hr/bonus-schemes/{id}', 'POST api/v1/hr/bonus-schemes/{id}/cancel', 'POST api/v1/hr/bonus-schemes/{id}/preview', 'POST api/v1/hr/increment-batches', 'POST api/v1/hr/increment-batches/preview', 'GET api/v1/hr/people/{type}/{id}/pay-accounts', 'GET api/v1/hr/revisions', 'POST api/v1/hr/revisions', 'GET api/v1/hr/revisions/{id}', 'POST api/v1/hr/revisions/{id}/cancel', 'GET api/v1/hr/revisions/{id}/letter.pdf', 'GET api/v1/hr/salary-components', 'POST api/v1/hr/salary-components', 'DELETE api/v1/hr/salary-components/{id}', 'PUT api/v1/hr/salary-components/{id}', 'GET api/v1/hr/staff', 'GET api/v1/hr/staff/{id}', 'GET api/v1/hr/staff-attendance', 'POST api/v1/hr/staff-attendance'], true) ? [...self::ROLES, 'institution_staff'] : self::ROLES;
            $this->assertSame([], array_values(array_diff($roles, $knownRoles)), "{$key}: unknown role");
            if (str_starts_with(explode(' ', $key, 2)[1], 'api/v1/super/')) $this->assertSame(['super_admin'], $roles, "{$key}: the platform panel is Super Admin only");
        }
    }

    public function test_every_route_lets_in_exactly_the_roles_of_the_matrix(): void
    {
        Queue::fake();
        $i = $this->makeInstitution('matrix');
        // every R1 module and the custom_branding feature on, so only the ROLE can close a door here
        $i->forceFill(['enabled_modules' => array_fill_keys(config('release.modules'), true) + ['custom_branding' => true], 'staff_department_mode' => 'department'])->save();
        $users = [];
        foreach (self::ROLES as $role) {
            $users[$role] = in_array($role, User::PLATFORM_ROLES, true) ? $this->makeUser(null, $role) : $this->makeUser($i, $role);
            $users[$role]->forceFill(['must_change_password' => false])->save();
        }
        $salaryTeacher = \App\Support\Tenancy::as($i, fn () => \App\Models\Teacher::create(['user_id'=>$users['teacher']->id,'employee_id'=>'MATRIX-HR']));
        $staff = $this->makeUser($i, 'institution_staff');
        $staff->forceFill(['must_change_password' => false])->save();
        $staffDepartmentId = Tenancy::as($i, function () use ($i, $users, $staff) {
            $departments = app(DepartmentService::class);
            $department = $departments->create($users['admin'], ['name' => 'Teacher index']);
            $membership = $departments->addMember($users['admin'], $department->id, ['user_id' => $staff->id]);
            $duty = $departments->createDuty($users['admin'], $department->id, ['code' => 'TEACHER_INDEX', 'name' => 'Teacher index', 'permission_keys' => ['staff.teacher.index', 'staff.salary_advance.mine', 'staff.dashboard.teacher', 'staff.dashboard.accountant', 'staff.sms_log.index', 'staff.report.dues', 'staff.report.fees']]);
            $departments->assignDuties($users['admin'], $membership->id, ['duty_ids' => [$duty->id]]);
            Teacher::create(['user_id' => $staff->id, 'employee_id' => 'MATRIX-STAFF']);
            return $department->id;
        });
        $central = 'admin.' . config('tenancy.base_domain');

        $wrong = [];
        // The growing route inventory exceeds the real 300/user/minute limit. Keep every role assertion,
        // but spread this exhaustive role test across clock windows; production throttling stays enabled.
        $checkedRoutes = 0;
        foreach (self::matrix() as $key => $allowed) {
            if (++$checkedRoutes % 100 === 0) $this->travel(61)->seconds();
            [$method, $uri] = explode(' ', $key, 2);
            $path = strtr(substr($uri, strlen('api/v1/')), self::PARAMS);
            // D90 adds two numeric row placeholders; retain the same role assertions and all existing substitutions.
            $path = strtr($path, ['{department}' => '999999', '{duty}' => '999999']);
            // D84: use a valid shared action so route constraints do not preempt the role middleware.
            if ($uri === 'api/v1/hr/leaves/{id}/{action}') $path = str_replace('dry-run', 'cancel', $path);
            if ($uri === 'api/v1/fee-refunds/{id}/{action}') $path = str_replace('dry-run', 'process', $path);
            if ($uri === 'api/v1/hr/advances/{id}/{action}') $path = str_replace('dry-run', 'approve', $path);
            // D101: department staff hold per-report-type keys; use a reviewed financial type so the role assertion is not preempted.
            if ($uri === 'api/v1/accountant/reports/{type}') $path = 'accountant/reports/dues';
            if ($uri === 'api/v1/hr/people/{type}/{id}/salary') $path = 'hr/people/teacher/'.$salaryTeacher->id.'/salary';
            $host = str_starts_with($path, 'super/') || str_starts_with($path, 'writer/') ? $central : $this->hostOf($i);
            foreach (self::ROLES as $role) {
                $response = $this->api($method, $host, $path, $users[$role]);
                $status = $response->baseResponse->getStatusCode();     // a file download is a BinaryFileResponse
                $ok = in_array($role, $allowed, true);
                if ($ok && ($status === 403 || $status >= 500)) $wrong[] = "{$key} as {$role}: {$status} (allowed)";
                if (!$ok && $status !== 403) $wrong[] = "{$key} as {$role}: {$status} (should be 403)";
            }
            if (in_array($uri, ['api/v1/teachers', 'api/v1/teacher/salary/advances', 'api/v1/teacher/dashboard', 'api/v1/accountant/dashboard', 'api/v1/sms-logs', 'api/v1/accountant/reports/{type}'], true)) {
                $this->app['auth']->forgetGuards();
                $response = $this->json($method, 'http://'.$host.'/api/v1/'.$path, [], [
                    'Authorization' => 'Bearer '.$staff->createToken('role-matrix')->plainTextToken,
                    'X-Department-Id' => (string) $staffDepartmentId,
                ]);
                $status = $response->baseResponse->getStatusCode();
                if (in_array('institution_staff', $allowed, true) && ($status === 403 || $status >= 500)) $wrong[] = "{$key} as institution_staff: {$status} (allowed)";
            }
        }
        $this->assertSame([], $wrong);
    }
}
