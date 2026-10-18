<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/** D90/R3.6a: ship the new login identity without granting legacy business access.
 * R3.6b must add reviewed capability/resource enforcement before opening business routes.
 */
class StaffIdentityBoundary
{
    private const OWN_IDENTITY = [
        'PATCH api/v1/auth/change-password', 'GET api/v1/auth/sessions', 'DELETE api/v1/auth/sessions/{id}',
        'POST api/v1/auth/logout-all', 'PUT api/v1/auth/locale', 'GET api/v1/notifications',
        'PATCH api/v1/notifications/read-all', 'PATCH api/v1/notifications/{id}/read', 'PATCH api/v1/staff/profile',
        'GET api/v1/staff/departments', 'HEAD api/v1/staff/departments',
        'GET api/v1/staff/departments/{id}/portal', 'HEAD api/v1/staff/departments/{id}/portal',
        'GET api/v1/teachers', 'HEAD api/v1/teachers',
    ];
    public function handle(Request $request, Closure $next)
    {
        // Only reviewed method/URI/action combinations reach their D91 + own-resource checks.
        $ownBatches = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/teacher/batches'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\BatchController::class.'@mine';
        $ownPrograms = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/programs'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\ProgramController::class.'@index';
        $batchList = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/batches'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\BatchController::class.'@index';
        $batchShow = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/batches/{id}'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\BatchController::class.'@show';
        $programShow = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/programs/{id}'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\ProgramController::class.'@show';
        $subjectList = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/subjects'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\SubjectController::class.'@index';
        $subjectShow = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/subjects/{id}'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\SubjectController::class.'@show';
            $ownTeacherAdvances = in_array($request->method(), ['GET', 'HEAD'], true)
                && $request->route()->uri() === 'api/v1/teacher/salary/advances';
        $ownTeacherDashboard = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/teacher/dashboard'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Shared\DashboardController::class.'@teacher';
        $accountantDashboard = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/accountant/dashboard'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Shared\DashboardController::class.'@accountant';
        $smsLogs = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/sms-logs'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Sms\SmsLogController::class.'@index';
        $financialReport = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/accountant/reports/{type}'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Reports\ReportController::class.'@financial';
        $ownSalaryHistory = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/hr/people/{type}/{id}/salary'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Hr\SalaryStructureController::class.'@history';
        $results = str_starts_with(ltrim($request->route()->getActionName(), '\\'), \App\Http\Controllers\Exams\ResultController::class.'@')
            && in_array($request->method().' '.$request->route()->uri(), ['GET api/v1/results', 'HEAD api/v1/results', 'POST api/v1/results/bulk', 'PUT api/v1/results/{id}',
                'GET api/v1/exams/{id}/subjects/{subjectId}/entry', 'HEAD api/v1/exams/{id}/subjects/{subjectId}/entry', 'GET api/v1/results/marksheet/{studentId}', 'HEAD api/v1/results/marksheet/{studentId}'], true);
        // D101: the question-bank library, questions/quote/buy and own papers (spending and caps stay admin-only by their own role middleware)
        $questionBank = str_starts_with($request->route()->uri(), 'api/v1/question-bank/')
            && !in_array($request->route()->uri(), ['api/v1/question-bank/spending', 'api/v1/question-bank/caps'], true)
            && collect(['QbLibraryController', 'QbPurchaseController', 'QbPaperController'])->contains(fn ($c) => str_starts_with(ltrim($request->route()->getActionName(), '\\'), 'App\\Http\\Controllers\\QuestionBank\\'.$c.'@'));
        // D101: expenses, the cash book (not reopen) and fee collection/dues/receipts/payments; refunds, categories and the fee report stay closed
        $money = in_array($request->method().' '.$request->route()->uri(), ['GET api/v1/expenses', 'HEAD api/v1/expenses', 'POST api/v1/expenses', 'GET api/v1/expenses/report', 'HEAD api/v1/expenses/report',
                'GET api/v1/expenses/{id}', 'HEAD api/v1/expenses/{id}', 'PUT api/v1/expenses/{id}', 'DELETE api/v1/expenses/{id}',
                'GET api/v1/cashbook', 'HEAD api/v1/cashbook', 'GET api/v1/cashbook/range', 'HEAD api/v1/cashbook/range', 'POST api/v1/cashbook/{date}/close',
                'GET api/v1/cashbook/{date}/report.{ext}', 'HEAD api/v1/cashbook/{date}/report.{ext}',
                'POST api/v1/fees/collect', 'GET api/v1/fees/dues', 'HEAD api/v1/fees/dues', 'GET api/v1/fees/receipt/{id}', 'HEAD api/v1/fees/receipt/{id}',
                'GET api/v1/fees/payments', 'HEAD api/v1/fees/payments', 'GET api/v1/fees/payments/student/{id}', 'HEAD api/v1/fees/payments/student/{id}',
                'GET api/v1/fee-refunds', 'HEAD api/v1/fee-refunds', 'POST api/v1/fee-refunds', 'GET api/v1/fee-refunds/refundable', 'HEAD api/v1/fee-refunds/refundable',
                'GET api/v1/fee-refunds/{id}', 'HEAD api/v1/fee-refunds/{id}', 'POST api/v1/fee-refunds/{id}/{action}'], true)
            && collect(['Expenses\\ExpenseController', 'CashBook\\CashBookController', 'Fees\\FeeController', 'Fees\\FeeRefundController'])->contains(fn ($c) => str_starts_with(ltrim($request->route()->getActionName(), '\\'), 'App\\Http\\Controllers\\'.$c.'@'));
        // D101 (owner 2026-10-17): HR/payroll work behind per-area keys; approvals, bonus apply, pay-account edits and staff records stay admin-only
        $hr = in_array($request->method().' '.$request->route()->uri(), [
                'GET api/v1/hr/adjustments',
                'HEAD api/v1/hr/adjustments',
                'POST api/v1/hr/adjustments',
                'GET api/v1/hr/adjustments/suggest-extra-class',
                'HEAD api/v1/hr/adjustments/suggest-extra-class',
                'GET api/v1/hr/advances',
                'HEAD api/v1/hr/advances',
                'POST api/v1/hr/advances',
                'GET api/v1/hr/advances/{id}',
                'HEAD api/v1/hr/advances/{id}',
                'GET api/v1/hr/bonus-schemes',
                'HEAD api/v1/hr/bonus-schemes',
                'POST api/v1/hr/bonus-schemes',
                'DELETE api/v1/hr/bonus-schemes/{id}',
                'GET api/v1/hr/bonus-schemes/{id}',
                'HEAD api/v1/hr/bonus-schemes/{id}',
                'PUT api/v1/hr/bonus-schemes/{id}',
                'POST api/v1/hr/bonus-schemes/{id}/cancel',
                'POST api/v1/hr/bonus-schemes/{id}/preview',
                'POST api/v1/hr/increment-batches',
                'POST api/v1/hr/increment-batches/preview',
                'GET api/v1/hr/people/{type}/{id}/pay-accounts',
                'HEAD api/v1/hr/people/{type}/{id}/pay-accounts',
                'GET api/v1/hr/revisions',
                'HEAD api/v1/hr/revisions',
                'POST api/v1/hr/revisions',
                'GET api/v1/hr/revisions/{id}',
                'HEAD api/v1/hr/revisions/{id}',
                'POST api/v1/hr/revisions/{id}/cancel',
                'GET api/v1/hr/revisions/{id}/letter.pdf',
                'HEAD api/v1/hr/revisions/{id}/letter.pdf',
                'GET api/v1/hr/salary-components',
                'HEAD api/v1/hr/salary-components',
                'POST api/v1/hr/salary-components',
                'DELETE api/v1/hr/salary-components/{id}',
                'PUT api/v1/hr/salary-components/{id}',
                'GET api/v1/hr/staff',
                'HEAD api/v1/hr/staff',
                'GET api/v1/hr/staff/{id}',
                'HEAD api/v1/hr/staff/{id}',
                'GET api/v1/hr/staff-attendance',
                'HEAD api/v1/hr/staff-attendance',
                'POST api/v1/hr/staff-attendance'], true)
            && str_starts_with(ltrim($request->route()->getActionName(), '\\'), 'App\\Http\\Controllers\\Hr\\');
        // D102: the R3.9 inventory routes behind exact staff.inventory.* keys
        $inventory = in_array($request->method().' '.$request->route()->uri(), [
                'GET api/v1/inventory/items',
                'HEAD api/v1/inventory/items',
                'POST api/v1/inventory/items',
                'PUT api/v1/inventory/items/{id}',
                'DELETE api/v1/inventory/items/{id}',
                'GET api/v1/inventory/items/{id}/ledger',
                'HEAD api/v1/inventory/items/{id}/ledger',
                'GET api/v1/inventory/reports/{name}',
                'HEAD api/v1/inventory/reports/{name}',
                'GET api/v1/inventory/sales/{receipt_no}/receipt.pdf',
                'HEAD api/v1/inventory/sales/{receipt_no}/receipt.pdf',
                'GET api/v1/inventory/stock',
                'HEAD api/v1/inventory/stock',
                'POST api/v1/inventory/{type}'], true)
            && str_starts_with(ltrim($request->route()->getActionName(), '\\'), 'App\\Http\\Controllers\\Inventory\\');
        $attendance = str_starts_with(ltrim($request->route()->getActionName(), '\\'), \App\Http\Controllers\Academic\AttendanceController::class.'@')
            && in_array($request->method().' '.$request->route()->uri(), ['GET api/v1/attendance', 'HEAD api/v1/attendance', 'POST api/v1/attendance', 'PUT api/v1/attendance/{id}',
                'GET api/v1/attendance/report', 'HEAD api/v1/attendance/report', 'GET api/v1/attendance/summary/{id}', 'HEAD api/v1/attendance/summary/{id}'], true);
        if ($request->user()?->role === 'institution_staff'
            && !in_array($request->method().' '.$request->route()->uri(), self::OWN_IDENTITY, true) && !$ownBatches && !$ownPrograms && !$batchList && !$batchShow && !$programShow && !$subjectList && !$subjectShow && !$ownTeacherAdvances && !$ownTeacherDashboard && !$accountantDashboard && !$smsLogs && !$financialReport && !$ownSalaryHistory && !$attendance && !$results && !$questionBank && !$money && !$hr && !$inventory) {
            return response()->json(['success' => false, 'error' => 'forbidden', 'message' => __('errors.forbidden')], 403);
        }
        // D101 money routes: context and exact duty key are checked here, before any FormRequest validation can answer 422
        if (($money || $hr || $inventory) && $request->user()?->role === 'institution_staff') app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
        // D101: staff never write their own pay row (a revision, adjustment or advance naming themselves as payee)
        if ($hr && $request->user()?->role === 'institution_staff' && $request->isMethod('POST') && $request->filled(['payee_type', 'payee_id'])) {
            $model = ['teacher' => \App\Models\Teacher::class, 'staff' => \App\Models\StaffMember::class][$request->input('payee_type')] ?? null;
            if ($model && $model::whereKey((int) $request->input('payee_id'))->where('user_id', $request->user()->id)->exists()) {
                return response()->json(['success' => false, 'error' => 'forbidden', 'message' => __('errors.forbidden')], 403);
            }
        }
        return $next($request);
    }
}
