<?php
namespace App\Http\Controllers\Donations;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog,Donation,DonationFund,Donor};
use App\Services\Donations\DonationService;
use App\Services\PdfService;
use App\Support\Tenancy;
use Illuminate\Http\Request;

// R3.11 / D107 (donations.md §2): record, reverse (new row) and print a receipt; anonymous donations print without a name
class DonationController extends Controller
{
    private const FIELDS = ['id', 'donor_id', 'fund_id', 'campaign_id', 'amount', 'method', 'received_on', 'receipt_no', 'purpose_note', 'status', 'reverses_id'];

    public function index(Request $request)
    {
        $f = $request->validate(['from' => 'sometimes|date_format:Y-m-d', 'to' => 'sometimes|date_format:Y-m-d', 'fund_id' => 'sometimes|integer|min:1',
            'donor_id' => 'sometimes|integer|min:1', 'per_page' => 'sometimes|integer|min:1|max:100']);
        $rows = Donation::query()->when($f['from'] ?? null, fn ($q, $d) => $q->where('received_on', '>=', $d))->when($f['to'] ?? null, fn ($q, $d) => $q->where('received_on', '<=', $d))
            ->when($f['fund_id'] ?? null, fn ($q, $id) => $q->where('fund_id', $id))->when($f['donor_id'] ?? null, fn ($q, $id) => $q->where('donor_id', $id))
            ->orderByDesc('received_on')->orderByDesc('id')->paginate($f['per_page'] ?? 25);
        return response()->json(['success' => true, 'data' => collect($rows->items())->map(fn ($d) => $this->row($d)), 'meta' => ['total' => $rows->total(), 'current_page' => $rows->currentPage()]]);
    }

    public function store(Request $request, DonationService $donations)
    {
        return response()->json(['success' => true, 'data' => $this->row($donations->record($request->user(), $request->all()))], 201);
    }

    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => $this->row(Donation::findOrFail($id))]);
    }

    public function reverse(Request $request, int $id, DonationService $donations)
    {
        return response()->json(['success' => true, 'data' => $this->row($donations->reverse($request->user(), $id, $request->all()))]);
    }

    public function receipt(Request $request, int $id, PdfService $pdf)
    {
        $d = Donation::findOrFail($id);
        $donor = $d->donor_id ? Donor::withTrashed()->find($d->donor_id) : null;
        $report = ['title' => __('donations.receipt_title').($d->status === 'reversed' ? ' ('.__('donations.reversed').')' : ''),
            'filters' => $d->receipt_no.' · '.$d->received_on->toDateString(),
            'headings' => [__('donations.fund'), __('donations.method'), __('donations.amount')],
            'rows' => [[DonationFund::whereKey($d->fund_id)->value('name'), $d->method, (string) $d->amount]],
            'total' => [$donor?->name ?? __('donations.anonymous'), '', (string) $d->amount]];
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $request->user()->id, 'action' => 'donation.receipt', 'model' => 'Donation', 'model_id' => $d->id, 'new_data' => []]);
        return response($pdf->render('pdf.report', ['report' => $report]), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="'.$d->receipt_no.'.pdf"']);
    }

    private function row(Donation $d): array
    {
        return array_merge($d->only(self::FIELDS), ['received_on' => $d->received_on->toDateString(), 'amount' => (string) $d->amount]);
    }
}
