<?php
namespace App\Http\Controllers\Donations;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog,Donation,DonationFund,Expense};
use App\Services\Donations\DonationService;
use App\Support\{Money,Tenancy};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// R3.11 / D107 (donations.md §1-§3, D39): kind is a tag only; the institution defines a restricted fund's purpose in its description
class DonationFundController extends Controller
{
    private const FIELDS = ['id', 'name', 'kind', 'restricted', 'description', 'is_active'];

    public function index(DonationService $donations)
    {
        return response()->json(['success' => true, 'data' => DonationFund::orderBy('name')->get()->map(fn ($f) => $f->only(self::FIELDS) + ['balance' => Money::format($donations->balance($f->id)['balance'])])]);
    }

    public function store(Request $request)
    {
        $fund = DonationFund::create($this->validated($request));
        $this->audit($request, $fund, 'created');
        return response()->json(['success' => true, 'data' => $fund->only(self::FIELDS)], 201);
    }

    public function show(int $id, DonationService $donations)
    {
        $fund = DonationFund::findOrFail($id);
        return response()->json(['success' => true, 'data' => $fund->only(self::FIELDS) + array_map([Money::class, 'format'], $donations->balance($fund->id))]);
    }

    public function update(Request $request, int $id)
    {
        $fund = DonationFund::findOrFail($id);
        $fund->fill($this->validated($request, $fund))->save();
        $this->audit($request, $fund, 'updated');
        return response()->json(['success' => true, 'data' => $fund->only(self::FIELDS)]);
    }

    /** §3: received, reversed and spent rows in a date range with the running totals */
    public function statement(Request $request, int $id, DonationService $donations)
    {
        $fund = DonationFund::findOrFail($id);
        $f = $request->validate(['from' => 'sometimes|date_format:Y-m-d', 'to' => 'sometimes|date_format:Y-m-d']);
        $from = $f['from'] ?? null; $to = $f['to'] ?? null;
        $in = Donation::where('fund_id', $fund->id)->when($from, fn ($q) => $q->where('received_on', '>=', $from))->when($to, fn ($q) => $q->where('received_on', '<=', $to))
            ->orderBy('received_on')->orderBy('id')->get(['id', 'receipt_no', 'amount', 'method', 'received_on', 'status']);
        $out = Expense::where('fund_id', $fund->id)->when($from, fn ($q) => $q->where('expense_date', '>=', $from))->when($to, fn ($q) => $q->where('expense_date', '<=', $to))
            ->orderBy('expense_date')->orderBy('id')->get(['id', 'title', 'category', 'amount', 'expense_date', 'added_by']);
        return response()->json(['success' => true, 'data' => ['fund' => $fund->only(self::FIELDS), 'from' => $from, 'to' => $to,
            'donations' => $in, 'expenses' => $out] + array_map([Money::class, 'format'], $donations->balance($fund->id, $from, $to))]);
    }

    private function validated(Request $request, ?DonationFund $fund = null): array
    {
        if (array_diff(array_keys($request->all()), ['name', 'kind', 'restricted', 'description', 'is_active'])) abort(422);
        return $request->validate(['name' => [$fund ? 'sometimes' : 'required', 'string', 'max:100', Rule::unique('donation_funds', 'name')->where('institution_id', Tenancy::current()->id)->ignore($fund?->id)],
            'kind' => 'sometimes|in:general,zakat,sadaqah,waqf,project,other', 'restricted' => 'sometimes|boolean', 'description' => 'sometimes|nullable|string|max:255', 'is_active' => 'sometimes|boolean']);
    }

    private function audit(Request $request, DonationFund $fund, string $event): void
    {
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $request->user()->id, 'action' => 'donation.fund.'.$event, 'model' => 'DonationFund', 'model_id' => $fund->id, 'new_data' => []]);
    }
}
