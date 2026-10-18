<?php
namespace App\Http\Controllers\Accounting;
use App\Http\Controllers\Controller;
use App\Models\LedgerAccount;
use App\Services\Accounting\BankReconciliationService;
use Illuminate\Http\Request;

// R3.10 / D106 (accounting.md §5): generic CSV statement, suggested matches, user-confirmed match/unmatch
class BankReconciliationController extends Controller
{
    public function show(int $account_id, BankReconciliationService $bank)
    {
        return response()->json(['success' => true, 'data' => $bank->show($account_id)]);
    }

    /** POST /accounting/bank-reconciliation/{account_id}/import | match | unmatch */
    public function act(Request $request, int $account_id, string $action, BankReconciliationService $bank)
    {
        LedgerAccount::findOrFail($account_id);   // another institution's account is 404 before the statement is validated
        $data = match ($action) {
            'import' => $bank->import($account_id, $this->statement($request)),
            'match' => $bank->match($request->user(), $account_id, $request->only(['line_id', 'reference'])),
            'unmatch' => $bank->unmatch($request->user(), $account_id, $request->only(['line_id'])),
        };
        return response()->json(['success' => true, 'data' => $data]);
    }

    private function statement(Request $request): string
    {
        $f = $request->validate(['file' => 'required_without:csv|file|mimes:csv,txt|max:2048', 'csv' => 'required_without:file|string|max:500000']);
        return isset($f['file']) ? (string) file_get_contents($f['file']->getRealPath()) : $f['csv'];
    }
}
