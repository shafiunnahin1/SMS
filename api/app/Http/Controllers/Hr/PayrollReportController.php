<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Models\{PayrollItem,PayrollRun};
use App\Services\Hr\SalaryAccess;
use App\Support\Money;
use Illuminate\Http\Request;

// staff-payroll.md §14: the reports this release can answer from its own tables; others are later (PF, tax: R3.8)
class PayrollReportController extends Controller
{
    public function show(Request $request, string $name, SalaryAccess $access)
    {
        $access->actor($request->user());
        $f = $request->validate(['month' => 'sometimes|date_format:Y-m', 'year' => 'sometimes|digits:4']);
        $data = match ($name) {
            'held' => PayrollItem::where('status', 'held')->whereIn('run_id', PayrollRun::whereIn('status', ['draft', 'reviewed', 'approved'])->select('id'))
                ->orderBy('run_id')->get(['id', 'run_id', 'payee_type', 'payee_id', 'net', 'hold_reason']),
            'monthly-cost' => PayrollRun::whereIn('status', ['approved', 'paid'])->when($f['year'] ?? null, fn ($q, $y) => $q->where('month', 'like', $y.'-%'))
                ->orderBy('month')->get(['month', 'kind', 'label', 'payees_count', 'total_gross', 'total_deductions', 'total_net']),
            'register' => PayrollRun::with('items')->whereIn('status', ['approved', 'paid'])->where('month', $f['month'] ?? now()->format('Y-m'))->get()
                ->map(fn ($r) => ['run' => $r->only(['id', 'month', 'kind', 'label', 'status']), 'net' => Money::format($r->items->sum(fn ($i) => Money::toPaisa((string) $i->net))),
                    'items' => $r->items->map->only(['id', 'payee_type', 'payee_id', 'gross', 'total_deductions', 'net', 'status', 'slip_no'])->values()]),
            default => abort(404),
        };
        return response()->json(['success' => true, 'data' => $data]);
    }
}
