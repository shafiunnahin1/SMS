<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog,ProvidentFundEntry};
use App\Services\Hr\SalaryAccess;
use App\Services\PdfService;
use App\Support\{Money,Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// R3.8 (staff-payroll.md §10): the PF ledger. Payroll writes employee/employer/withdrawal rows; people add only interest or a
// correcting adjustment, each a new row with a reason. This is a ledger only - no fund custody, investment or legal interest rule.
class ProvidentFundController extends Controller
{
    public function index(Request $request, SalaryAccess $access)
    {
        $access->actor($request->user());
        $f = $request->validate(['payee_type' => 'sometimes|in:teacher,staff', 'payee_id' => 'sometimes|integer|min:1', 'month' => 'sometimes|date_format:Y-m', 'per_page' => 'sometimes|integer|min:1|max:100']);
        $rows = ProvidentFundEntry::query()->when($f['payee_type'] ?? null, fn ($q, $t) => $q->where('payee_type', $t))
            ->when($f['payee_id'] ?? null, fn ($q, $id) => $q->where('payee_id', $id))->when($f['month'] ?? null, fn ($q, $m) => $q->where('month', $m))
            ->orderByDesc('month')->orderByDesc('id')->paginate($f['per_page'] ?? 25);
        return response()->json(['success' => true, 'data' => collect($rows->items())->map->only(['id', 'payee_type', 'payee_id', 'month', 'kind', 'amount', 'payroll_item_id', 'note', 'created_at']),
            'meta' => ['total' => $rows->total(), 'current_page' => $rows->currentPage()]]);
    }

    public function store(Request $request, SalaryAccess $access)
    {
        $actor = $access->actor($request->user());
        if (array_diff(array_keys($request->all()), ['payee_type', 'payee_id', 'month', 'kind', 'amount', 'note'])) abort(422);
        $data = $request->validate(['payee_type' => 'required|in:teacher,staff', 'payee_id' => 'required|integer|min:1', 'month' => 'required|date_format:Y-m',
            'kind' => 'required|in:interest,adjustment', 'amount' => ['required', 'regex:/^-?\d{1,8}(\.\d{1,2})?$/'], 'note' => 'required|string|max:255']);
        $access->payee($actor, $data['payee_type'], (int) $data['payee_id']);   // another institution's payee: 404
        if ($data['kind'] === 'interest' && Money::toPaisa($data['amount']) <= 0) abort(422);
        $entry = DB::transaction(function () use ($data, $actor) {
            Tenancy::current()->newQuery()->whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $balance = Money::toPaisa((string) ProvidentFundEntry::where('payee_type', $data['payee_type'])->where('payee_id', $data['payee_id'])->sum('amount'));
            if ($balance + Money::toPaisa($data['amount']) < 0) abort(422);   // a correction never makes the balance negative
            $entry = ProvidentFundEntry::create($data + ['amount' => Money::format(Money::toPaisa($data['amount'])), 'created_by' => $actor->id]);
            AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $actor->id, 'action' => 'salary.pf.'.$data['kind'], 'model' => 'ProvidentFundEntry', 'model_id' => $entry->id, 'new_data' => ['note' => $data['note']]]);
            return $entry;
        });
        return response()->json(['success' => true, 'data' => $entry->only(['id', 'payee_type', 'payee_id', 'month', 'kind', 'amount', 'note'])], 201);
    }

    public function statement(Request $request, string $type, int $id, SalaryAccess $access, PdfService $pdf)
    {
        $actor = $access->actor($request->user());
        $payee = $access->payee($actor, $type, $id);
        $rows = ProvidentFundEntry::where('payee_type', $type)->where('payee_id', $id)->orderBy('month')->orderBy('id')->get();
        $running = 0;
        $report = ['title' => __('salary.pf_statement'), 'filters' => $payee->employee_id ?? '', 'headings' => [__('salary.month'), __('salary.pf_kind'), __('salary.amount'), __('salary.balance')],
            'rows' => $rows->map(function ($r) use (&$running) { $running += Money::toPaisa((string) $r->amount); return [$r->month, $r->kind, (string) $r->amount, Money::format($running)]; })->all(),
            'total' => [__('salary.total'), '', '', Money::format($running)]];
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $actor->id, 'action' => 'salary.pf.statement', 'model' => $type === 'teacher' ? 'Teacher' : 'StaffMember', 'model_id' => $id, 'new_data' => []]);
        return response($pdf->render('pdf.report', ['report' => $report]), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="pf-statement-'.$type.'-'.$id.'.pdf"']);
    }
}
