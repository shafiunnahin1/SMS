<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, CashBookClosing, Expense, FeePayment, Institution};
use App\Support\{Money, Tenancy};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CashBookService
{
    /** Called inside a transaction, BEFORE all financial row locks/writes (D82). */
    public function lockInstitution(): void
    {
        Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
    }

    public function latest(string $date): ?CashBookClosing
    {
        return CashBookClosing::where('date', $date)->orderByDesc('revision')->first();
    }

    public function assertCashWrite(string $date, string $method): void
    {
        if ($date > now()->toDateString()) throw ValidationException::withMessages(['date' => __('errors.cashbook_future')]);
        if ($method === 'cash' && $this->latest($date)?->status === 'closed') {
            throw new BusinessException(__('errors.day_closed'), 'day_closed', 409);
        }
    }

    public static function calculate(string $opening, string $in, string $out, ?string $counted = null): array
    {
        $expected = Money::toPaisa($opening) + Money::toPaisa($in) - Money::toPaisa($out);
        return ['expected_closing' => Money::format($expected), 'difference' => $counted === null ? null : Money::format(Money::toPaisa($counted) - $expected)];
    }

    private function opening(string $date, ?string $manual = null, bool $closing = false): string
    {
        $previousDate = CashBookClosing::where('date', '<', $date)->max('date');
        if ($previousDate) {
            $previous = $this->latest($previousDate);
            $hasOpenHistory = $closing && CashBookClosing::where('date', '<', $date)->orderBy('revision')->get()
                ->groupBy(fn ($row) => $row->date->format('Y-m-d'))->contains(fn ($rows) => $rows->last()->status !== 'closed');
            if ($closing && ($hasOpenHistory || Carbon::parse($previousDate)->addDay()->toDateString() !== $date)) {
                throw new BusinessException(__('errors.cashbook_sequence'), 'cashbook_sequence');
            }
            return $previous->counted_cash ?? $previous->expected_closing;
        }
        $existing = $this->latest($date);
        if ($existing) return $existing->opening_cash;
        if ($closing && ($manual === null || CashBookClosing::where('date', '>', $date)->exists())) {
            throw ValidationException::withMessages(['opening_cash' => __('errors.cashbook_opening')]);
        }
        return $manual ?? '0.00';
    }

    public function show(string $date, ?string $manual = null): array
    {
        $start = Carbon::parse($date)->startOfDay();
        $end = $start->copy()->addDay();
        // Positive receipts only; future refund expenses are the canonical cash outflow (D82).
        $fees = FeePayment::where('paid_at', '>=', $start)->where('paid_at', '<', $end)->where('paid_amount', '>', 0)->get();
        $expenses = Expense::where('expense_date', $date)->get();
        // R3.9: store sales come in and money-back returns go out under source = store (docs/modules/inventory.md §2.3, §2.8).
        [$sales, $returns] = InventoryService::cashRows($start, $end);
        $sum = fn ($rows, $field) => Money::format($rows->sum(fn ($row) => Money::toPaisa($row->$field)));
        $add = fn (string ...$amounts) => Money::format(array_sum(array_map([Money::class, 'toPaisa'], $amounts)));
        $in = $add($sum($fees->where('payment_method', 'cash'), 'paid_amount'), $sum($sales->where('payment_method', 'cash'), 'total_amount'));
        $out = $add($sum($expenses->where('payment_method', 'cash'), 'amount'), $sum($returns->where('payment_method', 'cash'), 'total_amount'));
        $latest = $this->latest($date);
        $opening = Money::format(Money::toPaisa($this->opening($date, $manual)));
        $methods = $fees->pluck('payment_method')->merge($expenses->pluck('payment_method'))->merge($sales->pluck('payment_method'))
            ->merge($returns->pluck('payment_method'))->unique()->sort()->values();
        return ['date' => $date, 'opening_cash' => $opening, 'cash_in' => $in, 'cash_out' => $out,
            ...self::calculate($opening, $in, $out), 'status' => $latest?->status ?? 'open',
            'methods' => $methods->map(fn ($method) => ['method' => $method,
                'in' => $add($sum($fees->where('payment_method', $method), 'paid_amount'), $sum($sales->where('payment_method', $method), 'total_amount')),
                'out' => $add($sum($expenses->where('payment_method', $method), 'amount'), $sum($returns->where('payment_method', $method), 'total_amount'))])->all(),
            'store' => ['sales' => $sum($sales, 'total_amount'), 'returns' => $sum($returns, 'total_amount')],
            'income_categories' => $fees->groupBy('fee_category_id')->map(fn ($rows, $id) => ['fee_category_id' => $id, 'amount' => $sum($rows, 'paid_amount')])->values()->all(),
            'expense_categories' => $expenses->groupBy('category')->map(fn ($rows, $category) => ['category' => $category, 'amount' => $sum($rows, 'amount')])->values()->all(),
            'collectors' => $fees->groupBy('collected_by')->map(fn ($rows, $id) => ['collected_by' => $id ?: null, 'amount' => $sum($rows, 'paid_amount')])->values()->all(),
            'history' => CashBookClosing::where('date', $date)->orderBy('revision')->get()];
    }

    public function close(string $date, array $input, int $by): CashBookClosing
    {
        return DB::transaction(function () use ($date, $input, $by) {
            $this->lockInstitution();
            $latest = $this->latest($date);
            if ($latest?->status === 'closed') throw new BusinessException(__('errors.day_closed'), 'day_closed', 409);
            $opening = $this->opening($date, isset($input['opening_cash']) ? (string) $input['opening_cash'] : null, true);
            $day = $this->show($date, $opening);
            $counted = Money::format(Money::toPaisa($input['counted_cash']));
            $math = self::calculate($opening, $day['cash_in'], $day['cash_out'], $counted);
            if ($math['difference'] !== '0.00' && !trim($input['note'] ?? '')) throw ValidationException::withMessages(['note' => __('errors.cashbook_note')]);
            foreach ([$opening, $day['cash_in'], $day['cash_out'], $math['expected_closing'], $math['difference']] as $amount) {
                if (abs(Money::toPaisa($amount)) > 999999999999) throw new BusinessException(__('errors.cashbook_amount'), 'cashbook_amount');
            }
            $row = CashBookClosing::create(['date' => $date, 'revision' => ($latest?->revision ?? 0) + 1, 'opening_cash' => $opening,
                'cash_in' => $day['cash_in'], 'cash_out' => $day['cash_out'], ...$math, 'counted_cash' => $counted,
                'status' => 'closed', 'note' => $input['note'] ?? null, 'closed_by' => $by, 'closed_at' => now()]);
            AuditLog::record('cashbook.closed', $row);
            return $row;
        });
    }

    public function reopen(string $date, string $reason, int $by): CashBookClosing
    {
        return DB::transaction(function () use ($date, $reason, $by) {
            $this->lockInstitution();
            $latest = $this->latest($date);
            if (!$latest) abort(404);
            if ($latest->status !== 'closed') throw new BusinessException(__('errors.cashbook_not_closed'), 'cashbook_not_closed', 409);
            $data = $latest->only(['opening_cash', 'cash_in', 'cash_out', 'expected_closing', 'counted_cash', 'difference', 'note', 'closed_by', 'closed_at']);
            $row = CashBookClosing::create($data + ['date' => $date, 'revision' => $latest->revision + 1,
                'status' => 'reopened', 'reopened_by' => $by, 'reopened_at' => now(), 'reopen_reason' => $reason]);
            AuditLog::record('cashbook.reopened', $row, ['previous_id' => $latest->id]);
            return $row;
        });
    }

    public function range(string $from, string $to): array
    {
        $days = [];
        for ($date = Carbon::parse($from); $date->toDateString() <= $to; $date->addDay()) $days[] = $this->show($date->toDateString());
        return $days;
    }
}
