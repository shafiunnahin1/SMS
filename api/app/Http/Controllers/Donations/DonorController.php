<?php
namespace App\Http\Controllers\Donations;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog,Donation,DonationFund,Donor};
use App\Services\PdfService;
use App\Support\{Money,Tenancy};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// R3.11 / D107 (donations.md §1, §2.6): donor records for admin/accountant only; soft delete keeps the donations
class DonorController extends Controller
{
    private const FIELDS = ['id', 'name', 'phone', 'address', 'type', 'note', 'is_active'];

    public function index(Request $request)
    {
        $f = $request->validate(['q' => 'sometimes|string|max:120', 'per_page' => 'sometimes|integer|min:1|max:100']);
        $rows = Donor::query()->when($f['q'] ?? null, fn ($q, $s) => $q->where(fn ($w) => $w->where('name', 'like', '%'.$s.'%')->orWhere('phone', 'like', '%'.$s.'%')))
            ->orderBy('name')->paginate($f['per_page'] ?? 25);
        return response()->json(['success' => true, 'data' => collect($rows->items())->map->only(self::FIELDS), 'meta' => ['total' => $rows->total(), 'current_page' => $rows->currentPage()]]);
    }

    public function store(Request $request)
    {
        $donor = Donor::create($this->validated($request));
        $this->audit($request, $donor, 'created');
        return response()->json(['success' => true, 'data' => $donor->only(self::FIELDS)], 201);
    }

    public function show(int $id)
    {
        $donor = Donor::findOrFail($id);
        return response()->json(['success' => true, 'data' => $donor->only(self::FIELDS) + ['donations' => Donation::where('donor_id', $donor->id)->orderByDesc('received_on')->orderByDesc('id')
            ->get(['id', 'fund_id', 'amount', 'method', 'received_on', 'receipt_no', 'status'])]]);
    }

    public function update(Request $request, int $id)
    {
        $donor = Donor::findOrFail($id);
        $donor->fill($this->validated($request, $donor))->save();
        $this->audit($request, $donor, 'updated');
        return response()->json(['success' => true, 'data' => $donor->only(self::FIELDS)]);
    }

    public function destroy(Request $request, int $id)
    {
        $donor = Donor::findOrFail($id);
        $donor->delete();
        $this->audit($request, $donor, 'deleted');
        return response()->json(['success' => true]);
    }

    /** §3: the donor's yearly statement, on the donor's request */
    public function statement(Request $request, int $id, PdfService $pdf)
    {
        $donor = Donor::findOrFail($id);
        $year = (int) ($request->validate(['year' => 'sometimes|integer|min:2000|max:2100'])['year'] ?? now()->year);
        $rows = Donation::where('donor_id', $donor->id)->whereYear('received_on', $year)->orderBy('received_on')->orderBy('id')->get();
        $funds = DonationFund::whereIn('id', $rows->pluck('fund_id'))->pluck('name', 'id');
        $total = $rows->sum(fn ($r) => ($r->status === 'received' ? 1 : -1) * Money::toPaisa((string) $r->amount));
        $report = ['title' => __('donations.statement_title'), 'filters' => $donor->name.' · '.$year,
            'headings' => [__('donations.date'), __('donations.receipt_no'), __('donations.fund'), __('donations.amount')],
            'rows' => $rows->map(fn ($r) => [$r->received_on->toDateString(), $r->receipt_no, $funds[$r->fund_id] ?? '', ($r->status === 'reversed' ? '-' : '').$r->amount])->all(),
            'total' => [__('donations.total'), '', '', Money::format($total)]];
        $this->audit($request, $donor, 'statement');
        return response($pdf->render('pdf.report', ['report' => $report]), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="donor-'.$donor->id.'-'.$year.'.pdf"']);
    }

    private function validated(Request $request, ?Donor $donor = null): array
    {
        if (array_diff(array_keys($request->all()), ['name', 'phone', 'address', 'type', 'note', 'is_active'])) abort(422);
        $req = $donor ? 'sometimes' : 'required';
        return $request->validate(['name' => $req.'|string|max:120', 'phone' => ['sometimes', 'nullable', 'string', 'regex:/^\+?\d{6,15}$/',
            Rule::unique('donors', 'phone')->where('institution_id', Tenancy::current()->id)->ignore($donor?->id)],
            'address' => 'sometimes|nullable|string|max:255', 'type' => 'sometimes|in:individual,organization', 'note' => 'sometimes|nullable|string|max:255', 'is_active' => 'sometimes|boolean']);
    }

    private function audit(Request $request, Donor $donor, string $event): void
    {
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $request->user()->id, 'action' => 'donation.donor.'.$event, 'model' => 'Donor', 'model_id' => $donor->id, 'new_data' => []]);
    }
}
