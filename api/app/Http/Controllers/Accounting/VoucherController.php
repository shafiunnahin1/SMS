<?php
namespace App\Http\Controllers\Accounting;
use App\Http\Controllers\Controller;
use App\Models\Voucher;
use App\Services\Accounting\AccountingService;
use Illuminate\Http\Request;

// R3.10 / D106 (accounting.md §1, §6): manual vouchers are drafts until posted; a posted voucher changes only by a reversing voucher
class VoucherController extends Controller
{
    public function index(Request $request)
    {
        $f = $request->validate(['from' => 'sometimes|date_format:Y-m-d', 'to' => 'sometimes|date_format:Y-m-d', 'type' => 'sometimes|in:receipt,payment,journal,contra',
            'status' => 'sometimes|in:draft,posted,reversed', 'source' => 'sometimes|string|max:12', 'per_page' => 'sometimes|integer|min:1|max:100']);
        $rows = Voucher::query()->when($f['from'] ?? null, fn ($q, $d) => $q->where('date', '>=', $d))->when($f['to'] ?? null, fn ($q, $d) => $q->where('date', '<=', $d))
            ->when($f['type'] ?? null, fn ($q, $t) => $q->where('type', $t))->when($f['status'] ?? null, fn ($q, $s) => $q->where('status', $s))
            ->when($f['source'] ?? null, fn ($q, $s) => $q->where('source', $s))->orderByDesc('date')->orderByDesc('id')->paginate($f['per_page'] ?? 25);
        return response()->json(['success' => true, 'data' => collect($rows->items())->map(fn ($v) => $this->row($v)), 'meta' => ['total' => $rows->total(), 'current_page' => $rows->currentPage()]]);
    }

    public function store(Request $request, AccountingService $accounting)
    {
        if (array_diff(array_keys($request->all()), ['type', 'date', 'narration', 'lines', 'post'])) abort(422);
        $request->validate(['lines' => 'required|array', 'post' => 'sometimes|boolean']);
        $voucher = $accounting->create($request->only(['type', 'date', 'narration']), $request->input('lines'), $request->user(), $request->boolean('post'));
        return response()->json(['success' => true, 'data' => $this->row($voucher, true)], 201);
    }

    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => $this->row(Voucher::with('lines')->findOrFail($id), true)]);
    }

    /** POST /accounting/vouchers/{id}/post | reverse { reason, date? } */
    public function transition(Request $request, int $id, string $action, AccountingService $accounting)
    {
        Voucher::findOrFail($id);
        if ($action === 'post') $voucher = $accounting->post($request->user(), $id);
        else {
            $data = $request->validate(['reason' => 'required|string|max:255', 'date' => 'sometimes|date_format:Y-m-d']);
            $voucher = $accounting->reverse($request->user(), $id, $data['reason'], $data['date'] ?? null);
        }
        return response()->json(['success' => true, 'data' => $this->row($voucher->loadMissing('lines'), true)]);
    }

    private function row(Voucher $v, bool $lines = false): array
    {
        $row = $v->only(['id', 'voucher_no', 'type', 'narration', 'source', 'source_id', 'status', 'reverses_id', 'posted_at']) + ['date' => $v->date->toDateString()];
        if ($lines) $row['lines'] = $v->lines->map->only(['id', 'account_id', 'debit', 'credit', 'memo', 'reconciled_at', 'reconciled_ref'])->all();
        return $row;
    }
}
