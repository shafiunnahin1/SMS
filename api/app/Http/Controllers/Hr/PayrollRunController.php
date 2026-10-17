<?php
namespace App\Http\Controllers\Hr;
use App\Http\Controllers\Controller;
use App\Http\Resources\PayrollResource;
use App\Models\{AuditLog,PayrollItem,PayrollRun,SalaryPayAccount,StaffMember,Teacher,User};
use App\Services\Hr\{PayrollPaymentService,PayrollRunService,SalaryAccess};
use App\Services\PdfService;
use Illuminate\Http\Request;

// R3.7 / D104 (staff-payroll.md §7-§8, §15): runs for admin/accountant; numbers come only from the services
class PayrollRunController extends Controller
{
    public function index(Request $request, SalaryAccess $access)
    {
        $access->actor($request->user());
        $f = $request->validate(['month' => 'sometimes|date_format:Y-m', 'status' => 'sometimes|in:draft,reviewed,approved,paid,cancelled', 'per_page' => 'sometimes|integer|min:1|max:100']);
        $rows = PayrollRun::query()->when($f['month'] ?? null, fn ($q, $m) => $q->where('month', $m))->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('month')->orderByDesc('id')->paginate($f['per_page'] ?? 25);
        return PayrollResource::collection($rows)->additional(['success' => true]);
    }

    public function store(Request $request, PayrollRunService $runs)
    {
        return (new PayrollResource($runs->create($request->user(), $request->all())))->additional(['success' => true])->response()->setStatusCode(201);
    }

    public function show(Request $request, int $id, SalaryAccess $access)
    {
        $access->actor($request->user());
        return (new PayrollResource(PayrollRun::with('items')->findOrFail($id)))->additional(['success' => true]);
    }

    /** POST /hr/payroll-runs/{id}/{recompute|review|approve|reject|cancel|pay} */
    public function transition(Request $request, int $id, string $action, PayrollRunService $runs, PayrollPaymentService $payments)
    {
        $run = $action === 'pay' ? $payments->pay($request->user(), $id, $request->all()) : $runs->transition($request->user(), $id, $action, $request->all());
        return (new PayrollResource($run))->additional(['success' => true]);
    }

    /** GET /hr/payroll-runs/{id}/{disbursement.csv|register.pdf}; every download is audited (§8, §12) */
    public function download(Request $request, int $id, string $file, SalaryAccess $access, PdfService $pdf)
    {
        $actor = $access->actor($request->user());
        $run = PayrollRun::with('items')->findOrFail($id);
        if (!in_array($file, ['disbursement.csv', 'register.pdf'], true)) abort(404);
        if (!in_array($run->status, ['approved', 'paid'], true)) abort(409);
        AuditLog::create(['institution_id' => $run->institution_id, 'user_id' => $actor->id, 'action' => 'salary.payroll.downloaded', 'model' => 'PayrollRun', 'model_id' => $run->id, 'new_data' => ['file' => $file]]);
        $names = $this->names($run->items);
        if ($file === 'register.pdf') {
            $rows = $run->items->map(fn ($i) => [$i->slip_no, $names[$i->payee_type.':'.$i->payee_id] ?? '', $i->gross, $i->total_deductions, $i->net, $i->status])->all();
            $report = ['title' => __('salary.register').' '.$run->month, 'headings' => ['#', __('salary.payee'), __('salary.gross'), __('salary.deductions'), __('salary.net'), ''],
                'filters' => $run->kind.($run->label !== '' ? ' · '.$run->label : ''), 'rows' => $rows, 'total' => [__('salary.total'), '', (string) $run->total_gross, (string) $run->total_deductions, (string) $run->total_net, '']];
            return response($pdf->render('pdf.report', ['report' => $report], 'a4', 'landscape'), 200, ['Content-Type' => 'application/pdf',
                'Content-Disposition' => 'attachment; filename="payroll-register-'.$run->month.'.pdf"']);
        }
        // generic columns only; a bank-specific upload format is TODO(OD-bank-format) - no format is assumed
        $out = fopen('php://temp', 'r+');
        fputcsv($out, ['payee', 'method', 'account_name', 'account_number', 'bank', 'branch', 'amount', 'reference']);
        foreach ($run->items->whereIn('status', ['ready', 'failed', 'paid']) as $item) {
            $account = SalaryPayAccount::where('payee_type', $item->payee_type)->where('payee_id', $item->payee_id)->orderByDesc('is_default')->orderBy('id')->first();
            fputcsv($out, [$names[$item->payee_type.':'.$item->payee_id] ?? '', $item->payment_method ?? $account?->method, $account?->account_name, $account?->account_number,
                $account?->bank_name, $account?->branch_name, (string) $item->net, $item->slip_no]);
        }
        rewind($out); $csv = stream_get_contents($out); fclose($out);
        return response($csv, 200, ['Content-Type' => 'text/csv; charset=UTF-8', 'Content-Disposition' => 'attachment; filename="disbursement-'.$run->month.'.csv"', 'Cache-Control' => 'no-store']);
    }

    private function names($items): array
    {
        $out = [];
        $teachers = Teacher::whereIn('id', $items->where('payee_type', 'teacher')->pluck('payee_id'))->get(['id', 'user_id']);
        $users = User::inTenant()->whereIn('id', $teachers->pluck('user_id')->filter())->pluck('name', 'id');
        foreach ($teachers as $t) $out['teacher:'.$t->id] = $users[$t->user_id] ?? '';
        foreach (StaffMember::whereIn('id', $items->where('payee_type', 'staff')->pluck('payee_id'))->get(['id', 'name']) as $s) $out['staff:'.$s->id] = $s->name;
        return $out;
    }
}
