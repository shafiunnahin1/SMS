<?php

namespace Tests\Feature;

use App\Models\{AuditLog, Batch, FeeCategory, FeePayment, Institution, Program, Student, Subject, Teacher, User};
use App\Services\{FeeService, StudentService};
use App\Notifications\GeneralNotification;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RouteDef;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

// docs/TESTING.md "TenantIsolationTest": two tenants of each of the four types; no tenant-scoped endpoint ever returns another
// tenant's row. The framework discovers the routes itself, so every route added in later steps is checked without editing
// this file - except a route with an {id}, which must say below how to make a row of another tenant (the test fails until it does).
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    private const TYPES = ['school', 'college', 'coaching', 'private_batch'];

    /** @var array<string, array{institution: Institution, admin: User}> keyed by slug (the slug doubles as a marker in every row) */
    private array $tenants = [];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (self::TYPES as $type) {
            foreach (['a', 'b'] as $n) {
                $slug = 'iso' . str_replace('_', '', $type) . $n;
                $inst = $this->makeInstitution($slug, $type);
                $admin = $this->makeUser($inst, 'admin');
                $admin->forceFill(['name' => "admin {$slug}"])->save();
                Tenancy::as($inst, function () use ($admin, $slug) {
                    $admin->notify(new GeneralNotification('notice', "note {$slug}", 'notice'));
                    AuditLog::record('isolation.seed', $admin, ['marker' => $slug]);
                });
                $admin->createToken("seed {$slug}");
                $this->tenants[$slug] = ['institution' => $inst, 'admin' => $admin];
                $this->seedReceipt($this->tenants[$slug]);
            }
        }
    }

    /** How to make a row of $other that a route's {id} could point at. Every tenant route with a parameter must be listed. */
    private function foreignIds(): array
    {
        return [
            'GET api/v1/staff/departments/{id}/portal' => null, // CrossTenantRouteTest uses institution_staff and a real foreign department.
            'POST api/v1/admin/departments/{department}/members' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DepartmentMembership::factory()->create()),
            'PATCH api/v1/admin/department-memberships/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DepartmentMembership::factory()->create()->id),
            'PUT api/v1/admin/department-memberships/{id}/duties' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DepartmentMembership::factory()->create()->id),
            'GET api/v1/admin/departments/{department}/duties' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DepartmentDuty::factory()->create()),
            'POST api/v1/admin/departments/{department}/duties' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DepartmentDuty::factory()->create()),
            'PUT api/v1/admin/departments/{department}/duties/{duty}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DepartmentDuty::factory()->create()),
            'PUT api/v1/admin/departments/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\InstitutionDepartment::factory()->create()->id),
            'POST api/v1/admin/departments/{id}/archive' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\InstitutionDepartment::factory()->create()->id),
            // D90 new account identities; existing foreign-id cases remain intact.
            'PUT api/v1/admin/staff/{id}' => fn (array $other) => User::firstOrCreate(['institution_id' => $other['institution']->id, 'role' => 'institution_staff'], ['name' => 'Foreign staff fixture', 'password' => 'Fixture@1234', 'is_active' => false])->id,
            'POST api/v1/admin/staff/{id}/activation' => fn (array $other) => User::firstOrCreate(['institution_id' => $other['institution']->id, 'role' => 'institution_staff'], ['name' => 'Foreign staff fixture', 'password' => 'Fixture@1234', 'is_active' => false])->id,
            'PUT api/v1/hr/salary-components/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryComponent::factory()->create()->id),
            'DELETE api/v1/hr/salary-components/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryComponent::factory()->create()->id),
            'GET api/v1/hr/people/{type}/{id}/salary' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\StaffMember::factory()->create()->id),
            'GET api/v1/hr/people/{type}/{id}/pay-accounts' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\StaffMember::factory()->create()->id),
            'PUT api/v1/hr/people/{type}/{id}/pay-accounts' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\StaffMember::factory()->create()->id),
            'GET api/v1/hr/revisions/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryRevision::factory()->create()->id),
            'POST api/v1/hr/revisions/{id}/approve' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryRevision::factory()->create()->id),
            'POST api/v1/hr/revisions/{id}/reject' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryRevision::factory()->create()->id),
            'POST api/v1/hr/revisions/{id}/cancel' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryRevision::factory()->create()->id),
            'GET api/v1/hr/revisions/{id}/letter.pdf' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryRevision::factory()->create()->id),
            'GET api/v1/hr/bonus-schemes/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\BonusScheme::factory()->create()->id),
            'PUT api/v1/hr/bonus-schemes/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\BonusScheme::factory()->create()->id),
            'DELETE api/v1/hr/bonus-schemes/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\BonusScheme::factory()->create()->id),
            'POST api/v1/hr/bonus-schemes/{id}/preview' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\BonusScheme::factory()->create()->id),
            'POST api/v1/hr/bonus-schemes/{id}/apply' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\BonusScheme::factory()->create()->id),
            'POST api/v1/hr/bonus-schemes/{id}/cancel' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\BonusScheme::factory()->create()->id),
            'POST api/v1/hr/adjustments/{id}/approve' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryAdjustment::factory()->create()->id),
            'POST api/v1/hr/adjustments/{id}/cancel' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryAdjustment::factory()->create()->id),
            'POST api/v1/hr/final-settlement/{type}/{id}/start' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\StaffMember::factory()->create()->id),
            'GET api/v1/hr/pf/{type}/{id}/statement.pdf' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\StaffMember::factory()->create()->id),
            'GET api/v1/hr/payroll-runs/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\PayrollRun::factory()->create()->id),
            'POST api/v1/hr/payroll-runs/{id}/{action}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\PayrollRun::factory()->create()->id),
            'GET api/v1/hr/payroll-runs/{id}/{file}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\PayrollRun::factory()->create()->id),
            'PATCH api/v1/hr/payroll-items/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\PayrollItem::factory()->create()->id),
            'GET api/v1/hr/payroll-items/{id}/slip.pdf' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\PayrollItem::factory()->create()->id),
            'GET api/v1/hr/reports/{name}' => null,
            'POST api/v1/question-bank/blueprints/{id}/plan' => null,       // D126: a platform blueprint id, the same for every institution
            'GET api/v1/question-bank/blueprints/{id}/candidates' => null,
            'GET api/v1/teacher/salary/slips/{id}.pdf' => null,
            'GET api/v1/hr/advances/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryAdvance::factory()->create()->id),
            'POST api/v1/hr/advances/{id}/{action}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\SalaryAdvance::factory()->create()->id),
            'GET api/v1/hr/staff/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\StaffMember::factory()->create()->id),
            'PUT api/v1/hr/staff/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\StaffMember::factory()->create()->id),
            'DELETE api/v1/hr/staff/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\StaffMember::factory()->create()->id),
            'PUT api/v1/hr/leave-types/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\LeaveType::factory()->create()->id),
            'PATCH api/v1/hr/leaves/{id}/{action}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\LeaveApplication::factory()->create()->id),
            'GET api/v1/fee-refunds/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\FeeRefund::factory()->create()->id),
            // Literal {action} checks routing here; RefundCapTest exercises all three actual actions with foreign root IDs.
            'POST api/v1/fee-refunds/{id}/{action}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\FeeRefund::factory()->create()->id),
            'GET api/v1/expenses/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Expense::factory()->create()->id),
            // Date routes are independently covered by CashBookTenancyTest (no foreign row ID in the URL).
            'GET api/v1/cashbook/{date}/report.{ext}' => null,
            'PUT api/v1/inventory/items/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\InventoryItem::factory()->create()->id),
            'DELETE api/v1/inventory/items/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\InventoryItem::factory()->create()->id),
            'GET api/v1/inventory/items/{id}/ledger' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\InventoryItem::factory()->create()->id),
            'GET api/v1/inventory/reports/{name}' => null,
            // R3.11 / D107 donation rows
            'GET api/v1/donors/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Donor::factory()->create()->id),
            'PUT api/v1/donors/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Donor::factory()->create()->id),
            'DELETE api/v1/donors/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Donor::factory()->create()->id),
            'GET api/v1/donors/{id}/statement.pdf' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Donor::factory()->create()->id),
            'GET api/v1/donation-funds/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DonationFund::factory()->create()->id),
            'PUT api/v1/donation-funds/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DonationFund::factory()->create()->id),
            'GET api/v1/donation-funds/{id}/statement' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DonationFund::factory()->create()->id),
            'GET api/v1/donation-campaigns/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DonationCampaign::factory()->create()->id),
            'PUT api/v1/donation-campaigns/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DonationCampaign::factory()->create()->id),
            'GET api/v1/donation-campaigns/{id}/progress' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\DonationCampaign::factory()->create()->id),
            'GET api/v1/donations/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Donation::factory()->create()->id),
            'POST api/v1/donations/{id}/reverse' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Donation::factory()->create()->id),
            'GET api/v1/donations/{id}/receipt.pdf' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Donation::factory()->create()->id),
            // R3.10 / D106 accounting rows
            'PUT api/v1/accounting/accounts/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\LedgerAccount::factory()->create()->id),
            'GET api/v1/accounting/vouchers/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Voucher::factory()->create()->id),
            'POST api/v1/accounting/vouchers/{id}/{action}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Voucher::factory()->create()->id),
            'GET api/v1/accounting/budgets/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Budget::factory()->create()->id),
            'PUT api/v1/accounting/budgets/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Budget::factory()->create()->id),
            'PUT api/v1/accounting/budgets/{id}/lines' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Budget::factory()->create()->id),
            'POST api/v1/accounting/budgets/{id}/approve' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Budget::factory()->create()->id),
            'GET api/v1/accounting/reports/{name}' => null,   // ledger/budget ids in the query: AccountingTenancyTest
            'GET api/v1/accounting/bank-reconciliation/{account_id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\LedgerAccount::factory()->create(['is_cash_or_bank' => true, 'type' => 'asset'])->id),
            'POST api/v1/accounting/bank-reconciliation/{account_id}/{action}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\LedgerAccount::factory()->create(['is_cash_or_bank' => true, 'type' => 'asset'])->id),
            'GET api/v1/inventory/sales/{receipt_no}/receipt.pdf' => null,   // receipt numbers: InventoryTenancyTest
            'POST api/v1/inventory/{type}' => null,   // item_id in the body: InventoryTenancyTest
            'POST api/v1/cashbook/{date}/close' => null,
            'POST api/v1/cashbook/{date}/reopen' => null,
            'PUT api/v1/expenses/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Expense::factory()->create()->id),
            'DELETE api/v1/expenses/{id}' => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\Expense::factory()->create()->id),
            'PATCH api/v1/notifications/{id}/read'         => fn (array $other) => $other['admin']->notifications()->value('id'),
            'DELETE api/v1/auth/sessions/{id}'             => fn (array $other) => $other['admin']->tokens()->value('id'),
            'POST api/v1/admin/users/{id}/force-logout'    => fn (array $other) => $other['admin']->id,
            'POST api/v1/admin/users/{id}/unlock'          => fn (array $other) => $other['admin']->id,
            'GET api/v1/audit-logs/{id}'                   => fn (array $other) => Tenancy::as($other['institution'], fn () => AuditLog::value('id')),
            'GET api/v1/students/{id}'                     => fn (array $other) => $this->seedStudent($other),
            'POST api/v1/students/{id}/anonymize'          => fn (array $other) => $this->seedStudent($other),     // Step 8.1
            'GET api/v1/parent/children/{id}/export'       => null,       // parent-only route (the admin is 403); ErasureRemovesAllStudentFilesTest: another child 404
            'GET api/v1/fees/payments/student/{id}'        => fn (array $other) => $this->seedStudent($other),
            'GET api/v1/fees/receipt/{id}'                 => fn (array $other) => $this->seedReceipt($other),
            'GET api/v1/exams/{id}'                        => fn (array $other) => $this->seedExam($other),
            'PUT api/v1/exams/{id}'                        => fn (array $other) => $this->seedExam($other),
            'DELETE api/v1/exams/{id}'                     => fn (array $other) => $this->seedExam($other),
            'POST api/v1/exams/{id}/publish'               => fn (array $other) => $this->seedExam($other),
            'GET api/v1/exams/{id}/subjects'               => fn (array $other) => $this->seedExam($other),
            'PUT api/v1/exams/{id}/subjects'               => fn (array $other) => $this->seedExam($other),
            'PUT api/v1/results/{id}'                      => fn (array $other) => $this->seedResult($other),
            'GET api/v1/exams/{id}/subjects/{subjectId}/entry' => null,   // two ids: ExamSubjectsTest checks a foreign exam is a 404
            'GET api/v1/results/marksheet/{studentId}'     => null,       // MarksheetAccessTest: a foreign student is a 404
            'GET api/v1/parent/children/{id}/results'      => null,       // parent-only route (the admin is 403); ParentResultAccessTest: foreign child 404
            'PUT api/v1/fees/categories/{id}'              => fn (array $other) => Tenancy::as($other['institution'], fn () => \App\Models\FeeCategory::value('id')
                ?? \App\Models\FeeCategory::create(['name' => 'Tuition', 'amount' => 500, 'frequency' => 'monthly'])->id),
            'PUT api/v1/students/{id}'                     => fn (array $other) => $this->seedStudent($other),
            'DELETE api/v1/students/{id}'                  => fn (array $other) => $this->seedStudent($other),
            'GET api/v1/students/{id}/consents'            => fn (array $other) => $this->seedStudent($other),
            'GET api/v1/students/{id}/consent-form.pdf'    => fn (array $other) => $this->seedStudent($other),
            'GET api/v1/admin/reports/{type}'              => null,   // {type} is a report name, not a row; ReportTest: a foreign program_id is a 422
            'GET api/v1/accountant/reports/{type}'         => null,
            'POST api/v1/students/{id}/consents'           => fn (array $other) => $this->seedStudent($other),
            'GET api/v1/students/{id}/enrollments'         => fn (array $other) => $this->seedStudent($other),
            'PUT api/v1/enrollments/{id}'                  => fn (array $other) => $this->rowOf($other, \App\Models\Enrollment::class),
            'POST api/v1/enrollments/{id}/end'             => fn (array $other) => $this->rowOf($other, \App\Models\Enrollment::class),
            'POST api/v1/enrollments/{id}/transfer'        => fn (array $other) => $this->rowOf($other, \App\Models\Enrollment::class),
            'GET api/v1/programs/{id}'                     => fn (array $other) => $this->rowOf($other, Program::class),
            'PUT api/v1/programs/{id}'                     => fn (array $other) => $this->rowOf($other, Program::class),
            'DELETE api/v1/programs/{id}'                  => fn (array $other) => $this->rowOf($other, Program::class),
            'GET api/v1/batches/{id}'                      => fn (array $other) => $this->rowOf($other, Batch::class),
            'PUT api/v1/batches/{id}'                      => fn (array $other) => $this->rowOf($other, Batch::class),
            'DELETE api/v1/batches/{id}'                   => fn (array $other) => $this->rowOf($other, Batch::class),
            'GET api/v1/batches/{id}/students'             => fn (array $other) => $this->rowOf($other, Batch::class),
            'GET api/v1/subjects/{id}'                     => fn (array $other) => $this->seedSubject($other),
            'PUT api/v1/subjects/{id}'                     => fn (array $other) => $this->seedSubject($other),
            'DELETE api/v1/subjects/{id}'                  => fn (array $other) => $this->seedSubject($other),
            'GET api/v1/teachers/{id}'                     => fn (array $other) => $this->seedTeacher($other),
            'PUT api/v1/teachers/{id}'                     => fn (array $other) => $this->seedTeacher($other),
            'DELETE api/v1/teachers/{id}'                  => fn (array $other) => $this->seedTeacher($other),
            'PUT api/v1/attendance/{id}'                   => fn (array $other) => $this->seedAttendance($other),
            'GET api/v1/attendance/summary/{id}'           => fn (array $other) => $this->seedStudent($other),
            // the parent route needs a parent: ParentAttendanceAccessTest checks another tenant's child (404) and another child (403)
            'GET api/v1/parent/children/{id}/attendance'   => null,
            'GET api/v1/imports/{id}'                      => fn (array $other) => $this->seedImport($other),
            'PUT api/v1/imports/{id}/mapping'              => fn (array $other) => $this->seedImport($other),
            'GET api/v1/imports/{id}/errors.xlsx'          => fn (array $other) => $this->seedImport($other),
            // {action} stays literal here, so this proves only routing; ImportFlowTest calls each action on another tenant's job
            'POST api/v1/imports/{id}/{action}'            => fn (array $other) => $this->seedImport($other),
            'GET api/v1/imports/templates/{kind}.xlsx'     => null,
            // the parameter is not a row id: the route only touches the caller's own children (WalkingSkeletonSliceTest, consent test)
            'PUT api/v1/parent/consents/{type}'            => null,
            // QB.5: {id} is a platform catalogue row (no institution_id), not a tenant row; QbLibraryTest: a draft is a 404 and
            // another institution's unlock opens nothing here
            'GET api/v1/question-bank/concepts/{id}'       => null,
            'GET api/v1/question-bank/resources/{id}'      => null,
            'GET api/v1/question-bank/questions/{id}'      => null,   // QB.7: a catalogue row too; QbPurchaseTest: another institution's purchase opens nothing
            // QB.8: an institution's question papers (tenant rows; the admin sees all of its own)
            // QB.9: catalogue rows and the student's own order ref; QbStudentTest: another student's / institution's ones never open
            'GET api/v1/student/qb/questions/{id}'         => null,
            'GET api/v1/student/qb/concepts/{id}'          => null,
            'GET api/v1/student/qb/orders/{ref}'           => null,
            // QB.10: student-only routes (the admin is 403); catalogue rows (packages, quizzes) and the student's own attempts -
            // QbQuizTest: another student's attempt is a 404
            'POST api/v1/student/qb/quiz-packages/{id}/buy' => null,
            'POST api/v1/student/qb/quizzes/{id}/attempts' => null,
            'GET api/v1/student/qb/attempts/{id}'          => null,
            'PUT api/v1/student/qb/attempts/{id}'          => null,
            'POST api/v1/student/qb/attempts/{id}/submit'  => null,
            'GET api/v1/question-bank/papers/{id}'         => fn (array $other) => $this->seedPaper($other),
            'PUT api/v1/question-bank/papers/{id}'         => fn (array $other) => $this->seedPaper($other),
            'DELETE api/v1/question-bank/papers/{id}'      => fn (array $other) => $this->seedPaper($other),
            'POST api/v1/question-bank/papers/{id}/finalize' => fn (array $other) => $this->seedPaper($other),
            'GET api/v1/question-bank/papers/{id}/pdf'     => fn (array $other) => $this->seedPaper($other),
            'GET api/v1/question-bank/papers/{id}/omr-form' => fn (array $other) => $this->seedPaper($other),
            'PUT api/v1/question-bank/papers/{id}/omr-form' => fn (array $other) => $this->seedPaper($other),
            'POST api/v1/question-bank/papers/{id}/omr-form/generate' => fn (array $other) => $this->seedPaper($other),
            'POST api/v1/question-bank/papers/{id}/omr-form/unlock' => fn (array $other) => $this->seedPaper($other),
            'GET api/v1/question-bank/papers/{id}/omr-form/pdf' => fn (array $other) => $this->seedPaper($other),
            'PUT api/v1/question-bank/papers/{id}/folder'  => fn (array $other) => $this->seedPaper($other),            // R2.1.5 (D126)
            'PUT api/v1/question-bank/paper-folders/{id}'  => fn (array $other) => $this->seedPaperFolder($other),
            'DELETE api/v1/question-bank/paper-folders/{id}' => fn (array $other) => $this->seedPaperFolder($other),
        ];
    }

    /** A student (named after the tenant's marker) in a batch with a monthly fee - created once per tenant */
    private function seedExam(array $t): int
    {
        $student = $this->seedStudent($t);
        return Tenancy::as($t['institution'], function () use ($student) {
            if ($id = \App\Models\Exam::value('id')) return $id;
            $program = \App\Models\Enrollment::where('student_id', $student)->value('program_id');
            \App\Models\Subject::create(['program_id' => $program, 'name' => 'Subject']);
            return app(\App\Services\ExamService::class)->create(['name' => 'Exam', 'program_id' => $program, 'exam_type' => 'term', 'academic_year' => 2026])->id;
        });
    }

    private function seedResult(array $t): int
    {
        $exam = $this->seedExam($t);
        $student = $this->seedStudent($t);
        return Tenancy::as($t['institution'], function () use ($exam, $student) {
            if ($id = \App\Models\Result::value('id')) return $id;
            $es = \App\Models\ExamSubject::where('exam_id', $exam)->first();
            app(\App\Services\ResultService::class)->bulkSaveMarks(\App\Models\Exam::find($exam), $es->subject_id, [['student_id' => $student, 'marks_obtained' => 50]]);
            return \App\Models\Result::value('id');
        });
    }

    private function seedStudent(array $t): int
    {
        return Tenancy::as($t['institution'], function () use ($t) {
            $slug = $t['institution']->slug;
            if ($id = Student::where('student_id', 'like', 'ISO%')->value('id')) return $id;
            \Illuminate\Support\Facades\Queue::fake();
            FeeCategory::create(['name' => "fee {$slug}", 'amount' => 100, 'frequency' => 'monthly']);
            $batch = Batch::create(['program_id' => Program::create(['name' => "program {$slug}"])->id, 'name' => "batch {$slug}"]);
            return app(StudentService::class)->create(['name' => "student {$slug}", 'student_id' => 'ISO' . $t['institution']->id, 'guardian_phone' => '01711111111'], $batch)->id;
        });
    }

    /** The tenant's first row of a model (seedStudent made a program and a batch) */
    private function rowOf(array $t, string $model): ?int
    {
        $this->seedStudent($t);
        return Tenancy::as($t['institution'], fn () => $model::value('id'));
    }

    private function seedSubject(array $t): int
    {
        $this->seedStudent($t);
        return Tenancy::as($t['institution'], fn () => Subject::value('id')
            ?? Subject::create(['program_id' => Program::value('id'), 'name' => "subject {$t['institution']->slug}"])->id);
    }

    /** A teacher row (with no login, so no other tenant gains a session) */
    private function seedTeacher(array $t): int
    {
        return Tenancy::as($t['institution'], fn () => Teacher::value('id') ?? Teacher::create(['employee_id' => 'ISO-T'])->id);
    }

    private function seedAttendance(array $t): int
    {
        $student = $this->seedStudent($t);
        return Tenancy::as($t['institution'], function () use ($student) {
            $e = \App\Models\Enrollment::where('student_id', $student)->first();
            return \App\Models\Attendance::value('id') ?? \App\Models\Attendance::create(['student_id' => $student, 'batch_id' => $e->batch_id,
                'program_id' => $e->program_id, 'date' => now()->toDateString(), 'status' => 'present'])->id;
        });
    }

    private function seedPaper(array $t): int
    {
        return Tenancy::as($t['institution'], fn () => \App\Models\QbPaper::value('id')
            ?? \App\Models\QbPaper::create(['created_by' => $t['admin']->id, 'title' => 'Paper', 'status' => 'draft'])->id);
    }

    private function seedPaperFolder(array $t): int
    {
        return Tenancy::as($t['institution'], fn () => \App\Models\QbPaperFolder::value('id')
            ?? \App\Models\QbPaperFolder::create(['created_by' => $t['admin']->id, 'name' => 'Folder'])->id);
    }

    private function seedImport(array $t): int
    {
        return Tenancy::as($t['institution'], fn () => \App\Models\ImportJob::value('id')
            ?? \App\Models\ImportJob::create(['kind' => 'students', 'status' => 'uploaded', 'file_path' => 'none', 'summary' => ['headers' => ['name']]])->id);
    }

    /** One receipt line of the tenant's student (collected once) */
    private function seedReceipt(array $t): int
    {
        $student = $this->seedStudent($t);
        return Tenancy::as($t['institution'], function () use ($student) {
            if ($id = FeePayment::value('id')) return $id;
            $fees = app(FeeService::class);
            $s = Student::findOrFail($student);
            return $fees->collect($s, [['key' => $fees->dueLines($s)->first()['key']]])->first()->id;
        });
    }

    /** @return RouteDef[] the routes that only run on a tenant host */
    private function tenantRoutes(): array
    {
        return array_values(array_filter(Route::getRoutes()->getRoutes(), fn (RouteDef $r) => in_array('tenant', $r->gatherMiddleware(), true)));
    }

    private static function key(RouteDef $r, string $method): string { return "{$method} {$r->uri()}"; }

    public function test_the_framework_has_two_tenants_of_each_type_and_finds_the_tenant_routes(): void
    {
        $this->assertSame(array_merge(...array_map(fn ($t) => [$t, $t], self::TYPES)), array_values(array_map(fn ($t) => $t['institution']->institution_type, $this->tenants)));
        $this->assertNotEmpty($this->tenantRoutes());
        $this->assertNotContains('GET api/v1/bootstrap', array_map(fn ($r) => self::key($r, 'GET'), $this->tenantRoutes()), 'any-host routes are not tenant routes');
    }

    public function test_every_tenant_list_endpoint_returns_only_the_callers_own_rows(): void
    {
        $lists = array_filter($this->tenantRoutes(), fn (RouteDef $r) => in_array('GET', $r->methods(), true) && !str_contains($r->uri(), '{'));
        $this->assertNotEmpty($lists);

        foreach ($this->tenants as $slug => $me) {
            $others = array_diff(array_keys($this->tenants), [$slug]);
            foreach ($lists as $route) {
                $path = substr($route->uri(), strlen('api/v1/'));
                $res = $this->api('GET', $this->hostOf($me['institution']), $path, $me['admin']);
                $where = "{$slug} GET {$path}";
                $this->assertLessThan(500, $res->status(), $where);
                if ($res->status() !== 200) continue;   // a feature or module this type does not have: nothing leaks either way
                foreach ($others as $other) $this->assertStringNotContainsString($other, $res->getContent(), "{$where} leaked {$other}");
                foreach (self::institutionIds($res->json()) as $id) $this->assertSame($me['institution']->id, $id, "{$where} returned institution_id {$id}");
            }
        }
    }

    public function test_every_tenant_route_with_an_id_refuses_another_tenants_row(): void
    {
        config(['auth_policy.api_per_minute' => 100000]);   // one user sweeps every route within seconds; the limit itself: ApiRateLimitTest
        $byId = [];
        foreach ($this->tenantRoutes() as $route) {
            if (!str_contains($route->uri(), '{')) continue;
            foreach (array_diff($route->methods(), ['HEAD']) as $method) $byId[self::key($route, $method)] = true;
        }
        $this->assertSame([], array_keys(array_diff_key($byId, $this->foreignIds())), 'add these routes to foreignIds()');

        $me = $this->tenants['isoschoola'];
        // D107: donations is opt-in; switch it on for the caller so the tenant boundary (404), not the module gate (403), answers
        $me['institution']->forceFill(['settings' => array_replace($me['institution']->fresh()->settings ?? [], ['opt_in_modules' => ['donations']])])->save();
        foreach (array_filter($this->foreignIds()) as $key => $make) {
            [$method, $uri] = explode(' ', $key, 2);
            foreach ($this->tenants as $slug => $other) {
                if ($slug === 'isoschoola') continue;
                $id = $make($other);
                $this->assertNotNull($id, "{$key}: no row seeded for {$slug}");
                if ($key === 'PUT api/v1/admin/department-memberships/{id}/duties') {
                    $this->api($method, $this->hostOf($me['institution']), 'admin/department-memberships/'.$id.'/duties', $me['admin'], ['duty_ids' => []])->assertNotFound();
                    continue;
                }
                if ($id instanceof \App\Models\DepartmentMembership) {
                    $path = str_replace('{department}', (string) $id->department_id, substr($uri, strlen('api/v1/')));
                    $this->api($method, $this->hostOf($me['institution']), $path, $me['admin'], ['user_id' => $id->user_id])->assertNotFound();
                    continue;
                }
                if ($id instanceof \App\Models\DepartmentDuty) {
                    $path = str_replace(['{department}', '{duty}'], [(string) $id->department_id, (string) $id->id], substr($uri, strlen('api/v1/')));
                    $this->api($method, $this->hostOf($me['institution']), $path, $me['admin'], ['code' => 'VALID', 'name' => 'Valid fixture', 'permission_keys' => ['staff.dashboard.accountant']])->assertNotFound();
                    continue;
                }
                $path = str_replace('{id}', (string) $id, substr($uri, strlen('api/v1/')));
                if (str_starts_with($uri, 'api/v1/hr/people/')) $path = str_replace('{type}', 'staff', $path);
                if ($uri === 'POST api/v1/hr/advances/{id}/{action}') $path = str_replace('{action}', 'approve', $path);
                if ($uri === 'POST api/v1/hr/payroll-runs/{id}/{action}') $path = str_replace('{action}', 'review', $path);
                if (str_contains($uri, 'api/v1/hr/final-settlement/') || str_contains($uri, 'api/v1/hr/pf/')) $path = str_replace('{type}', 'staff', $path);
                if ($uri === 'GET api/v1/hr/payroll-runs/{id}/{file}') $path = str_replace('{file}', 'disbursement.csv', $path);
                if (str_contains($uri, 'api/v1/accounting/')) $path = str_replace(['{account_id}', '{action}'], [(string) $id, str_contains($uri, 'vouchers') ? 'post' : 'match'], $path);
                $this->api($method, $this->hostOf($me['institution']), $path, $me['admin'])->assertNotFound();
            }
        }
        $this->assertSame(7, User::whereKeyNot($me['admin']->id)->whereHas('tokens')->count(), 'no other tenant lost a session');
    }

    private static function institutionIds(mixed $json): array
    {
        if (!is_array($json)) return [];
        $ids = [];
        foreach ($json as $k => $v) {
            if ($k === 'institution_id' && $v !== null) $ids[] = (int) $v;
            elseif (is_array($v)) array_push($ids, ...self::institutionIds($v));
        }
        return $ids;
    }
}
