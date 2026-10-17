<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, InventoryItem, InventoryMovement, Student, User};
use App\Support\{Money, Tenancy};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// R3.9 store / inventory (docs/modules/inventory.md). Quantities and amounts are both two-decimal strings and are
// computed as integers (hundredths), never floats (G9). Stock changes ONLY through a movement written here.
class InventoryService
{
    /** type => direction; `adjust` takes its sign from the requested quantity */
    public const DIRECTIONS = ['receive' => 1, 'return' => 1, 'issue' => -1, 'sale' => -1, 'damage' => -1, 'adjust' => 0];

    public function __construct(private CashBookService $cashbook) {}

    public function createItem(array $data): InventoryItem
    {
        $item = InventoryItem::create($data);
        AuditLog::record('inventory.item_created', $item);
        return $item->fresh();
    }

    public function updateItem(int $id, array $data): InventoryItem
    {
        $item = InventoryItem::findOrFail($id);
        $item->update($data);
        AuditLog::record('inventory.item_updated', $item);
        return $item->fresh();
    }

    /** Soft delete; an item with ledger history is only switched off, so its history stays readable. */
    public function removeItem(int $id): InventoryItem
    {
        $item = InventoryItem::findOrFail($id);
        if ($item->movements()->exists()) $item->update(['is_active' => false]);
        else $item->delete();
        AuditLog::record('inventory.item_removed', $item);
        return $item;
    }

    public function move(string $type, array $input, User $actor): InventoryMovement
    {
        return DB::transaction(function () use ($type, $input, $actor) {
            // D82 order: the institution lock comes before any financial row lock (also serialises STR- numbers).
            $this->cashbook->lockInstitution();
            $item = InventoryItem::lockForUpdate()->findOrFail($input['item_id']);
            if (!$item->is_active) throw new BusinessException(__('errors.inventory_inactive'), 'inventory_inactive');

            $qty = Money::toPaisa((string) $input['qty']);
            $direction = self::DIRECTIONS[$type] ?: ($qty < 0 ? -1 : 1);
            $qty = abs($qty);
            if ($qty === 0) throw ValidationException::withMessages(['qty' => __('errors.inventory_qty')]);
            $stock = Money::toPaisa($item->stock);
            $avg = Money::toPaisa($item->avg_cost);
            $after = $stock + $direction * $qty;
            if ($after < 0) throw new BusinessException(__('errors.insufficient_stock'), 'insufficient_stock');

            $row = ['item_id' => $item->id, 'type' => $type, 'qty' => Money::format($qty), 'direction' => $direction,
                'balance_after' => Money::format($after), 'created_by' => $actor->id, 'note' => $input['note'] ?? null,
                'reference' => $input['reference'] ?? null];

            if (in_array($type, ['damage', 'adjust'], true) && !trim((string) ($input['note'] ?? ''))) {
                throw ValidationException::withMessages(['note' => __('errors.inventory_reason_required')]);
            }
            if ($type === 'adjust' && $actor->role !== 'admin' && $qty * 100 > $stock * (int) config('inventory.adjust_review_percent', 10)) {
                throw new BusinessException(__('errors.inventory_adjust_needs_admin'), 'inventory_adjust_needs_admin', 403);
            }

            if ($type === 'receive') {
                $cost = Money::toPaisa((string) ($input['unit_amount'] ?? '0'));
                // moving average: (old stock x old avg + new qty x unit cost) / new stock, half up
                $avg = self::divideHalfUp($stock * $avg + $qty * $cost, $after);
                $row += ['unit_amount' => Money::format($cost), 'total_amount' => Money::format(self::times($qty, $cost)), 'supplier' => $input['supplier'] ?? null];
            } elseif ($type === 'sale') {
                if (!$item->is_sellable) throw new BusinessException(__('errors.inventory_not_sellable'), 'inventory_not_sellable');
                $price = Money::toPaisa((string) ($input['unit_amount'] ?? $item->sale_price));
                $method = $input['payment_method'] ?? 'cash';
                $this->cashbook->assertCashWrite(now()->toDateString(), $method);
                $row += ['unit_amount' => Money::format($price), 'total_amount' => Money::format(self::times($qty, $price)),
                    'payment_method' => $method, 'receipt_no' => $this->nextReceiptNo(), 'student_id' => $this->student($input)];
            } elseif ($type === 'return') {
                $row += $this->returnTerms($item, $qty, $input);
            } elseif ($type === 'issue') {
                $row += ['issued_to_type' => $input['issued_to_type'], 'issued_to_id' => $input['issued_to_id'] ?? null,
                    'student_id' => $input['issued_to_type'] === 'student' ? $this->student(['student_id' => $input['issued_to_id'] ?? null]) : null];
            }
            if (!isset($row['total_amount'])) $row += ['unit_amount' => Money::format($avg), 'total_amount' => Money::format(self::times($qty, $avg))];

            // created_at is the cash moment the cashbook reads, so it is the app clock, not the database default
            $movement = InventoryMovement::forceCreate($row + ['created_at' => now()]);
            $item->forceFill(['stock' => Money::format($after), 'avg_cost' => Money::format($avg)])->save();
            AuditLog::record('inventory.' . $type, $movement);
            return $movement->fresh();
        });
    }

    /** A return names the sale receipt; quantity may not exceed what that receipt sold minus earlier returns. */
    private function returnTerms(InventoryItem $item, int $qty, array $input): array
    {
        $receipt = $input['reference'] ?? null;
        if (!$receipt) return ['unit_amount' => '0.00', 'total_amount' => '0.00'];
        $sale = InventoryMovement::where('type', 'sale')->where('receipt_no', $receipt)->where('item_id', $item->id)->first();
        $returned = InventoryMovement::where('type', 'return')->where('reference', $receipt)->where('item_id', $item->id)->get()
            ->sum(fn ($m) => Money::toPaisa($m->qty));
        if (!$sale || $returned + $qty > Money::toPaisa($sale->qty)) {
            throw new BusinessException(__('errors.inventory_return_invalid'), 'inventory_return_invalid');
        }
        $method = $input['payment_method'] ?? null;    // money handed back -> cashbook out
        if ($method) $this->cashbook->assertCashWrite(now()->toDateString(), $method);
        $price = Money::toPaisa($sale->unit_amount);
        return ['unit_amount' => Money::format($price), 'total_amount' => $method ? Money::format(self::times($qty, $price)) : '0.00',
            'payment_method' => $method, 'student_id' => $sale->student_id];
    }

    private function student(array $input): ?int
    {
        return empty($input['student_id']) ? null : Student::findOrFail($input['student_id'])->id;
    }

    public function nextReceiptNo(): string
    {
        $prefix = 'STR-' . date('Y') . '-';
        $last = InventoryMovement::where('receipt_no', 'like', $prefix . '%')->orderByDesc('receipt_no')->value('receipt_no');
        return $prefix . str_pad((string) ($last ? ((int) substr($last, -5)) + 1 : 1), 5, '0', STR_PAD_LEFT);
    }

    /** Replays the ledger into the item caches (`inventory:rebuild`); returns the rebuilt items. */
    public function rebuild(): \Illuminate\Support\Collection
    {
        return InventoryItem::withTrashed()->get()->map(function (InventoryItem $item) {
            $stock = 0; $avg = 0;
            foreach ($item->movements()->orderBy('id')->get() as $m) {
                $qty = Money::toPaisa($m->qty);
                if ($m->type === 'receive') $avg = self::divideHalfUp($stock * $avg + $qty * Money::toPaisa($m->unit_amount), $stock + $qty);
                $stock += $m->direction * $qty;
            }
            $item->forceFill(['stock' => Money::format($stock), 'avg_cost' => Money::format($avg)])->save();
            return $item;
        });
    }

    public function ledger(int $id)
    {
        InventoryItem::withTrashed()->findOrFail($id);
        return InventoryMovement::where('item_id', $id)->orderByDesc('id')->paginate(50);
    }

    public function stock(bool $lowOnly)
    {
        return InventoryItem::where('is_active', true)
            ->when($lowOnly, fn ($q) => $q->whereColumn('stock', '<=', 'reorder_level'))->orderBy('code')->get();
    }

    /** Store sales and money-back returns of one day, for the cashbook (source = store). */
    public static function cashRows(Carbon $start, Carbon $end): array
    {
        $rows = InventoryMovement::where('created_at', '>=', $start)->where('created_at', '<', $end)->whereNotNull('payment_method')->get();
        return [$rows->where('type', 'sale'), $rows->where('type', 'return')];
    }

    public function report(string $name, array $filters): array
    {
        $from = $filters['from'] ?? now()->startOfMonth()->toDateString();
        $to = $filters['to'] ?? now()->toDateString();
        $sum = fn ($rows, $field) => Money::format($rows->sum(fn ($r) => Money::toPaisa($r->$field)));
        if (in_array($name, ['stock', 'valuation'], true)) {
            $items = InventoryItem::orderBy('code')->get();
            $value = fn ($i) => Money::format(self::times(Money::toPaisa($i->stock), Money::toPaisa($i->avg_cost)));
            $total = Money::format($items->sum(fn ($i) => Money::toPaisa($value($i))));
            return ['title' => __('pdf.inventory.' . $name), 'filters' => now()->toDateString(),
                'headings' => [__('pdf.inventory.code'), __('pdf.inventory.item'), __('pdf.inventory.qty'), __('pdf.inventory.avg_cost'), __('pdf.inventory.value')],
                'rows' => $items->map(fn ($i) => [$i->code, $i->name, $i->stock, $i->avg_cost, $value($i)])->all(),
                'total' => [__('pdf.inventory.total'), '', '', '', $total], 'summary' => ['items' => $items->count(), 'value' => $total]];
        }
        $rows = InventoryMovement::with('item')->whereBetween('created_at', [Carbon::parse($from)->startOfDay(), Carbon::parse($to)->endOfDay()])
            ->when($name === 'sales', fn ($q) => $q->where('type', 'sale'))->orderBy('id')->get();
        $total = $sum($rows, 'total_amount');
        return ['title' => __('pdf.inventory.' . $name), 'filters' => $from . ' - ' . $to,
            'headings' => [__('pdf.inventory.date'), __('pdf.inventory.type'), __('pdf.inventory.item'), __('pdf.inventory.qty'), __('pdf.inventory.receipt'), __('pdf.inventory.amount')],
            'rows' => $rows->map(fn ($m) => [$m->created_at->format('Y-m-d'), $m->type, $m->item->name, $m->qty, $m->receipt_no, $m->total_amount])->all(),
            'total' => [__('pdf.inventory.total'), '', '', '', '', $total], 'summary' => ['count' => $rows->count(), 'total' => $total]];
    }

    public function receipt(string $receiptNo): array
    {
        $sale = InventoryMovement::with('item')->where('type', 'sale')->where('receipt_no', $receiptNo)->firstOrFail();
        return ['title' => __('pdf.inventory.receipt_title') . ' ' . $sale->receipt_no, 'filters' => $sale->created_at->format('Y-m-d H:i') . ' · ' . $sale->payment_method,
            'headings' => [__('pdf.inventory.item'), __('pdf.inventory.qty'), __('pdf.inventory.price'), __('pdf.inventory.amount')],
            'rows' => [[$sale->item->name, $sale->qty, $sale->unit_amount, $sale->total_amount]],
            'total' => [__('pdf.inventory.total'), '', '', $sale->total_amount], 'sale' => $sale];
    }

    /** hundredths of a unit x paisa -> paisa, half up */
    private static function times(int $qty, int $paisa): int { return self::divideHalfUp($qty * $paisa, 100); }

    private static function divideHalfUp(int $numerator, int $denominator): int
    {
        if ($denominator === 0) return 0;
        return intdiv(2 * $numerator + $denominator, 2 * $denominator);
    }
}
