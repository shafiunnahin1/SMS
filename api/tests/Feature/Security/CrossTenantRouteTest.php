<?php

namespace Tests\Feature\Security;

use App\Models\{Batch, Exam, ExamSubject, FeeCategory, Program, Student, Subject, User};
use App\Services\{ExamService, StudentService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RouteDef;
use Illuminate\Support\Facades\Route;
use Tests\Feature\TenantIsolationTest;
use Tests\TestCase;

// docs/TESTING.md "CrossTenantRouteTest" (Step 8.2): EVERY tenant route with an id, given a valid id of ANOTHER institution,
// answers 404 - never 200 or 403 (no existence leak). TenantIsolationTest already does this as the admin for every {id} route it
// can; the routes it leaves out (null there) are the parent-only ones, the two-id entry sheet and the marksheet - they are called
// here with the role that may use them. Together the two cover every {id} route: a new one fails TenantIsolationTest until listed.
class CrossTenantRouteTest extends TestCase
{
    use RefreshDatabase;

    /** route => [role who may call it, how to build the path from the other tenant's ids] */
    private function plan(array $mine, array $theirs): array
    {
        return [
            'GET api/v1/staff/departments/{id}/portal' => ['institution_staff', "staff/departments/{$theirs['department']}/portal"],
            'GET api/v1/parent/children/{id}/export'       => ['parent', "parent/children/{$theirs['student']}/export"],
            'GET api/v1/parent/children/{id}/results'      => ['parent', "parent/children/{$theirs['student']}/results"],
            'GET api/v1/parent/children/{id}/attendance'   => ['parent', "parent/children/{$theirs['student']}/attendance"],
            'GET api/v1/results/marksheet/{studentId}'     => ['admin', "results/marksheet/{$theirs['student']}?exam_id={$theirs['exam']}&format=json"],
            'GET api/v1/exams/{id}/subjects/{subjectId}/entry' => ['admin', "exams/{$theirs['exam']}/subjects/{$theirs['subject']}/entry"],
            'PUT api/v1/exams/{id}/subjects/{subjectId}/paper' => ['admin', "exams/{$theirs['exam']}/subjects/{$theirs['subject']}/paper"],      // D158 (3)
            'DELETE api/v1/exams/{id}/subjects/{subjectId}/paper' => ['admin', "exams/{$theirs['exam']}/subjects/{$theirs['subject']}/paper"],
            'POST api/v1/exams/{id}/subjects/{subjectId}/mcq-import' => ['admin', "exams/{$theirs['exam']}/subjects/{$theirs['subject']}/mcq-import"],
            'POST api/v1/exams/{id}/subjects/{subjectId}/submission' => ['admin', "exams/{$theirs['exam']}/subjects/{$theirs['subject']}/submission"],   // D162
            'GET api/v1/teacher/salary/slips/{id}.pdf' => ['teacher', "teacher/salary/slips/{$theirs['payroll_item']}.pdf"],
        ];
    }

    /** Parameters that are not row ids: the route only reads the caller's own rows (each named test proves it) */
    private const NOT_ROW_IDS = [
        'GET api/v1/cashbook/{date}/report.{ext}', 'POST api/v1/cashbook/{date}/close', 'POST api/v1/cashbook/{date}/reopen', // CashBookTenancyTest: dates/format read only the caller's cashbook
        'GET api/v1/admin/reports/{type}', 'GET api/v1/accountant/reports/{type}',     // report name; ReportTest: a foreign program_id is 422
        'GET api/v1/hr/reports/{name}',                                                 // payroll report name; reads only the caller's runs (PayrollTenancyTest)
        'GET api/v1/inventory/reports/{name}', 'POST api/v1/inventory/{type}',             // report name / movement type; InventoryTenancyTest: a foreign item_id is 404
        'GET api/v1/accounting/reports/{name}',                                         // report name; AccountingTenancyTest: a foreign account_id/budget_id is 404
        'GET api/v1/inventory/sales/{receipt_no}/receipt.pdf',                         // InventoryTenancyTest: another institution's STR- receipt is 404
        'GET api/v1/imports/templates/{kind}.xlsx',                                    // template name, no data
        'POST api/v1/question-bank/blueprints/{id}/plan', 'GET api/v1/question-bank/blueprints/{id}/candidates',   // D126: platform blueprint ids; picks only this institution's own unlocks (QbBlueprintTest)
        'PUT api/v1/parent/consents/{type}',                                           // consent type of the caller's own children
        'GET api/v1/question-bank/concepts/{id}', 'GET api/v1/question-bank/resources/{id}', 'GET api/v1/question-bank/questions/{id}',
        'GET api/v1/student/qb/questions/{id}', 'GET api/v1/student/qb/concepts/{id}', 'GET api/v1/student/qb/resources/{id}', 'POST api/v1/student/qb/practice/{id}/submit', 'GET api/v1/student/qb/orders/{ref}',
        'POST api/v1/student/qb/quiz-packages/{id}/buy', 'POST api/v1/student/qb/quizzes/{id}/attempts',   // QB.10: catalogue rows
        'GET api/v1/student/qb/attempts/{id}', 'PUT api/v1/student/qb/attempts/{id}', 'POST api/v1/student/qb/attempts/{id}/submit',   // QB.10: own attempt (QbQuizTest: another student 404)   // QB.9: catalogue rows / own order by ref (QbStudentTest)   // QB.5: platform catalogue rows; QbLibraryTest: another institution's unlock opens nothing
    ];

    private function tenant(string $slug): array
    {
        $i = $this->makeInstitution($slug, 'school');
        $users = ['admin' => $this->makeUser($i, 'admin')];
        $ids = Tenancy::as($i, function () use ($slug) {
            \Illuminate\Support\Facades\Queue::fake();
            FeeCategory::create(['name' => 'Tuition', 'amount' => 100, 'frequency' => 'monthly']);
            $program = Program::create(['name' => "P {$slug}"]);
            $batch = Batch::create(['program_id' => $program->id, 'name' => "B {$slug}"]);
            $student = app(StudentService::class)->create(['name' => "Child {$slug}", 'guardian_phone' => '01711111111'], $batch);
            $subject = Subject::create(['program_id' => $program->id, 'name' => 'Math']);
            $exam = app(ExamService::class)->create(['name' => 'Term', 'program_id' => $program->id, 'exam_type' => 'term', 'academic_year' => 2026]);
            return ['student' => $student->id, 'exam' => $exam->id, 'subject' => ExamSubject::where('exam_id', $exam->id)->value('subject_id') ?? $subject->id];
        });
        $users['parent'] = Tenancy::as($i, fn () => Student::find($ids['student'])->parents()->first());
        $users['parent']->forceFill(['must_change_password' => false])->save();
        $users['institution_staff'] = $this->makeUser($i, 'institution_staff');
        $users['teacher'] = $this->makeUser($i, 'teacher');
        $ids['payroll_item'] = Tenancy::as($i, function () use ($users) {
            $teacher = \App\Models\Teacher::create(['user_id' => $users['teacher']->id, 'employee_id' => 'PAY-T', 'status' => 'active']);
            return \App\Models\PayrollItem::factory()->create(['payee_id' => $teacher->id])->id;
        });
        $ids['department'] = Tenancy::as($i, function () use ($users) {
            $service = app(\App\Services\DepartmentService::class);
            $department = $service->create($users['admin'], ['name' => 'Own context']);
            $service->addMember($users['admin'], $department->id, ['user_id' => $users['institution_staff']->id]);
            return $department->id;
        });
        return ['institution' => $i, 'users' => $users] + $ids;
    }

    public function test_every_id_route_left_out_by_tenant_isolation_answers_404_for_another_institutions_row(): void
    {
        $a = $this->tenant('crossa');
        $b = $this->tenant('crossb');

        // which {id} routes did TenantIsolationTest leave to us? (its list is the one that fails when a route is missing)
        $m = new \ReflectionMethod(TenantIsolationTest::class, 'foreignIds');
        $left = array_keys(array_filter($m->invoke(new TenantIsolationTest('x')), fn ($v) => $v === null));
        $plan = $this->plan($a, $b);
        $this->assertEqualsCanonicalizing($left, [...array_keys($plan), ...self::NOT_ROW_IDS], 'every route TenantIsolationTest skips is covered here or named as not a row id');

        foreach ($plan as $key => [$role, $path]) {
            [$method] = explode(' ', $key, 2);
            $res = $this->api($method, $this->hostOf($a['institution']), $path, $a['users'][$role]);
            $this->assertSame(404, $res->status(), "{$key} as {$role} with another institution's ids: " . $res->getContent());
        }

        // the same routes work for the caller's own rows (so the 404 above is the tenant boundary, not a broken route)
        $this->api('GET', $this->hostOf($a['institution']), "parent/children/{$a['student']}/export", $a['users']['parent'])->assertOk();
        $this->api('GET', $this->hostOf($a['institution']), "exams/{$a['exam']}/subjects/{$a['subject']}/entry", $a['users']['admin'])->assertOk();
        // mixed: my exam with their subject
        $this->api('GET', $this->hostOf($a['institution']), "staff/departments/{$a['department']}/portal", $a['users']['institution_staff'])->assertOk();
        $this->api('GET', $this->hostOf($a['institution']), "exams/{$a['exam']}/subjects/{$b['subject']}/entry", $a['users']['admin'])->assertNotFound();
    }

    public function test_every_tenant_route_with_a_parameter_is_known_to_one_of_the_two_tests(): void
    {
        $m = new \ReflectionMethod(TenantIsolationTest::class, 'foreignIds');
        $known = array_keys($m->invoke(new TenantIsolationTest('x')));
        $withParam = [];
        foreach (Route::getRoutes()->getRoutes() as $r) {
            /** @var RouteDef $r */
            if (!in_array('tenant', $r->gatherMiddleware(), true) || !str_contains($r->uri(), '{')) continue;
            foreach (array_diff($r->methods(), ['HEAD']) as $method) $withParam[] = "{$method} {$r->uri()}";
        }
        $this->assertSame([], array_values(array_diff($withParam, $known)));
    }
}
