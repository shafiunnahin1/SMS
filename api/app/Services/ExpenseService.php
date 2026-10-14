<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Expense};
use App\Support\Money;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;

class ExpenseService
{
    private array $newReceiptPaths = [];
    private const INPUT_FIELDS = ['category', 'title', 'amount', 'expense_date', 'note', 'payment_method', 'receipt'];
    private const FIELDS = ['category', 'title', 'amount', 'expense_date', 'note', 'receipt_path', 'payment_method', 'source', 'payroll_run_id', 'fund_id'];

    public function listing(array $filters)
    {
        return Expense::withExists('reversals')->when($filters['category'] ?? null, fn ($q, $v) => $q->where('category', $v))
            ->when($filters['from'] ?? null, fn ($q, $v) => $q->where('expense_date', '>=', $v))
            ->when($filters['to'] ?? null, fn ($q, $v) => $q->where('expense_date', '<=', $v))
            ->orderByDesc('expense_date')->orderByDesc('id')->paginate($filters['per_page'] ?? 25);
    }

    public function find(int $id): Expense { return Expense::withExists('reversals')->findOrFail($id); }

    private function append(array $data, int $by): Expense
    {
        $receipt = $data['receipt'] ?? null;
        unset($data['receipt']);
        if ($receipt instanceof UploadedFile) {
            $institution = \App\Support\Tenancy::current();
            $path = 'institutions/' . $institution->id . '/finance/expenses';
            $data['receipt_path'] = $receipt->storeAs($path, Str::uuid() . '.' . $receipt->extension(), 'private');
            if (!$data['receipt_path']) throw new BusinessException(__('errors.expense_receipt_failed'), 'expense_receipt_failed', 500);
            $this->newReceiptPaths[] = $data['receipt_path'];
        }
        $data['added_by'] = $by;
        $data['amount'] = Money::format(Money::toPaisa($data['amount']));
        return Expense::create($data);
    }

    private function transaction(callable $operation): Expense
    {
        $this->newReceiptPaths = [];
        try { return DB::transaction($operation); }
        catch (\Throwable $error) {
            foreach ($this->newReceiptPaths as $path) Storage::disk('private')->delete($path);
            throw $error;
        } finally { $this->newReceiptPaths = []; }
    }

    public function create(array $data, int $by): Expense
    {
        $data = array_intersect_key($data, array_flip(self::INPUT_FIELDS));
        return $this->transaction(function () use ($data, $by) {
            $expense = $this->append($data + ['source' => 'manual', 'payment_method' => 'cash'], $by);
            AuditLog::record('expense.created', $expense);
            return $this->find($expense->id);
        });
    }

    public function correct(int $id, ?array $replacement, int $by): Expense
    {
        if ($replacement !== null) $replacement = array_intersect_key($replacement, array_flip(self::INPUT_FIELDS));
        return $this->transaction(function () use ($id, $replacement, $by) {
            $original = Expense::lockForUpdate()->findOrFail($id);
            if ($original->source !== 'manual' || $original->reversal_of_id !== null || $original->reversals()->exists()) {
                throw new BusinessException(__('errors.expense_not_active'), 'expense_not_active', 409);
            }
            $values = $original->only(self::FIELDS);
            $values['expense_date'] = $original->expense_date->format('Y-m-d');
            $reversal = $this->append(array_replace($values, ['amount' => Money::format(-Money::toPaisa($original->amount)), 'reversal_of_id' => $original->id]), $by);
            $result = $replacement === null ? $reversal : $this->append(array_replace($values, $replacement, ['replaces_expense_id' => $original->id]), $by);
            AuditLog::record($replacement === null ? 'expense.cancelled' : 'expense.corrected', $original,
                ['reversal_id' => $reversal->id, 'replacement_id' => $replacement === null ? null : $result->id]);
            return $this->find($result->id);
        });
    }

    public function report(string $month): array
    {
        $start = Carbon::createFromFormat('!Y-m', $month)->startOfMonth();
        $end = $start->copy()->endOfMonth();
        $query = fn () => Expense::whereBetween('expense_date', [$start->toDateString(), $end->toDateString()]);
        $total = Money::format(Money::toPaisa((string) $query()->sum('amount')));
        $entries = $query()->orderBy('expense_date')->orderBy('id')->get();
        return ['month' => $month, 'total' => $total, 'entries' => $entries,
            'table' => ['title' => __('pdf.expenses.title'), 'filters' => $month,
                'headings' => [__('pdf.expenses.date'), __('pdf.expenses.category'), __('pdf.expenses.item'), __('pdf.expenses.method'), __('pdf.expenses.amount')],
                'rows' => $entries->map(fn ($e) => [$e->expense_date->format('Y-m-d'), $e->category, $e->title, $e->payment_method, $e->amount])->all(),
                'total' => [__('pdf.expenses.total'), '', '', '', $total]]];
    }
}
