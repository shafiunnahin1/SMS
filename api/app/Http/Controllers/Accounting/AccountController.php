<?php
namespace App\Http\Controllers\Accounting;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog,LedgerAccount};
use App\Services\Accounting\AccountingService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// R3.10 / D106 (accounting.md §2, §6): the chart of accounts; the sample chart is created on first use, code/type freeze once used
class AccountController extends Controller
{
    private const FIELDS = ['id', 'code', 'name', 'type', 'parent_id', 'is_cash_or_bank', 'is_system', 'is_active'];

    public function index(Request $request, AccountingService $accounting)
    {
        $accounting->ensureChart();
        $f = $request->validate(['type' => 'sometimes|in:asset,liability,equity,income,expense', 'active' => 'sometimes|boolean']);
        $rows = LedgerAccount::query()->when($f['type'] ?? null, fn ($q, $t) => $q->where('type', $t))
            ->when(array_key_exists('active', $f), fn ($q) => $q->where('is_active', (bool) $f['active']))->orderBy('code')->get(self::FIELDS);
        return response()->json(['success' => true, 'data' => $rows]);
    }

    public function tree(AccountingService $accounting)
    {
        $accounting->ensureChart();
        $all = LedgerAccount::orderBy('code')->get(self::FIELDS)->groupBy(fn ($a) => $a->parent_id ?? 0);
        $build = function (int $parent) use (&$build, $all) {
            return ($all[$parent] ?? collect())->map(fn ($a) => $a->only(self::FIELDS) + ['children' => $build($a->id)])->values()->all();
        };
        return response()->json(['success' => true, 'data' => $build(0)]);
    }

    public function store(Request $request, AccountingService $accounting)
    {
        $accounting->ensureChart();
        if (array_diff(array_keys($request->all()), ['code', 'name', 'type', 'parent_id', 'is_cash_or_bank'])) abort(422);
        $data = $request->validate(['code' => ['required', 'string', 'max:20', 'regex:/^\d{4}(\.[A-Za-z0-9_-]{1,15})?$/', Rule::unique('ledger_accounts', 'code')->where('institution_id', Tenancy::current()->id)],
            'name' => 'required|string|max:120', 'type' => 'required|in:asset,liability,equity,income,expense', 'parent_id' => 'sometimes|nullable|integer|min:1', 'is_cash_or_bank' => 'sometimes|boolean']);
        if (!empty($data['parent_id'])) {
            $parent = LedgerAccount::findOrFail($data['parent_id']);
            if ($parent->type !== $data['type']) abort(422);
        }
        if (($data['is_cash_or_bank'] ?? false) && $data['type'] !== 'asset') abort(422);
        $account = LedgerAccount::create($data + ['is_system' => false, 'is_active' => true]);
        $this->audit($request, $account, 'created');
        return response()->json(['success' => true, 'data' => $account->only(self::FIELDS)], 201);
    }

    public function update(Request $request, int $id)
    {
        $account = LedgerAccount::findOrFail($id);
        if (array_diff(array_keys($request->all()), ['name', 'is_active'])) abort(422);
        $data = $request->validate(['name' => 'sometimes|string|max:120', 'is_active' => 'sometimes|boolean']);
        if ($account->is_system && array_key_exists('is_active', $data) && !$data['is_active']) abort(422);   // system accounts stay usable for automatic posting
        $account->fill($data)->save();
        $this->audit($request, $account, 'updated');
        return response()->json(['success' => true, 'data' => $account->only(self::FIELDS)]);
    }

    private function audit(Request $request, LedgerAccount $account, string $event): void
    {
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $request->user()->id, 'action' => 'accounting.account.'.$event, 'model' => 'LedgerAccount', 'model_id' => $account->id, 'new_data' => []]);
    }
}
