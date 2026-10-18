<?php
namespace App\Http\Controllers\Accounting;
use App\Http\Controllers\Controller;
use App\Services\Accounting\AccountingReportService;
use Illuminate\Http\Request;

// R3.10 / D106 (accounting.md §4): reports from posted vouchers; names and layout are samples for the accountant to confirm
class AccountingReportController extends Controller
{
    public function show(Request $request, string $name, AccountingReportService $reports)
    {
        $today = now()->toDateString();
        $data = match ($name) {
            'trial-balance' => $reports->trialBalance($request->validate(['as_of' => 'sometimes|date_format:Y-m-d'])['as_of'] ?? $today),
            'ledger' => (function () use ($request, $reports, $today) {
                $f = $request->validate(['account_id' => 'required|integer|min:1', 'from' => 'required|date_format:Y-m-d', 'to' => 'sometimes|date_format:Y-m-d|after_or_equal:from']);
                return $reports->ledger((int) $f['account_id'], $f['from'], $f['to'] ?? $today);
            })(),
            'income-expenditure' => (function () use ($request, $reports, $today) {
                $f = $request->validate(['from' => 'required|date_format:Y-m-d', 'to' => 'sometimes|date_format:Y-m-d|after_or_equal:from']);
                return $reports->incomeExpenditure($f['from'], $f['to'] ?? $today);
            })(),
            'balance-sheet' => $reports->balanceSheet($request->validate(['as_of' => 'sometimes|date_format:Y-m-d'])['as_of'] ?? $today),
            'budget-actual' => $reports->budgetActual((int) $request->validate(['budget_id' => 'required|integer|min:1'])['budget_id']),
            'unposted' => $reports->unposted(),
        };
        return response()->json(['success' => true, 'data' => $data]);
    }
}
