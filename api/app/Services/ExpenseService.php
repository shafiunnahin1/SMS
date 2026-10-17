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
            $cashbook = app(CashBookService::class);
            $cashbook->lockInstitution();
            $cashbook->assertCashWrite($data['expense_date'], $data['payment_method'] ?? 'cash');
            $expense = $this->append($data + ['source' => 'manual', 'payment_method' => 'cash'], $by);
            AuditLog::record('expense.created', $expense);
            return $this->find($expense->id);
        });
    }

    /** D87 internal operation; approved terms and amount come only from the persisted tenant advance. */
    public function disburseAdvance(\App\Models\SalaryAdvance $advance, string $date, string $method, \App\Models\User $actor): Expense
    {
        app(\App\Services\Hr\SalaryAccess::class)->actor($actor);
        return $this->transaction(function()use($advance,$date,$method,$actor){
            $cashbook=app(CashBookService::class);$cashbook->lockInstitution();
            $row=\App\Models\SalaryAdvance::lockForUpdate()->findOrFail($advance->id);
            if($row->status!=='approved' || $row->expense_id!==null) throw new BusinessException(__('salary.conflict'),'advance_conflict',409);
            \Illuminate\Support\Facades\Validator::make(['date'=>$date,'method'=>$method],['date'=>'required|date_format:Y-m-d|before_or_equal:today','method'=>'required|in:cash,bank,bkash,nagad,rocket,other'])->validate();
            $cashbook->assertCashWrite($date,$method);
            $expense=$this->append(['category'=>'advance','title'=>'Advance #'.$row->id,'amount'=>$row->amount,'expense_date'=>$date,'payment_method'=>$method,'source'=>'advance'],$actor->id);
            $row->expense_id=$expense->id;$row->payment_method=$method;$row->disbursed_at=now();$row->status='active';$row->save();return $expense;
        });
    }

    /** R3.7 internal operation: one summary row per run and payment method (negative for a returned payment); caller holds the cashbook lock */
    public function recordPayroll(\App\Models\PayrollRun $run, string $method, int $paisa, string $date, \App\Models\User $actor, string $title): Expense
    {
        app(CashBookService::class)->assertCashWrite($date, $method);
        return $this->append(['category' => 'salary', 'title' => $title, 'amount' => Money::format($paisa), 'expense_date' => $date,
            'payment_method' => $method, 'source' => 'payroll', 'payroll_run_id' => $run->id], $actor->id);
    }

    public function correct(int $id, ?array $replacement, int $by): Expense
    {
        if ($replacement !== null) $replacement = array_intersect_key($replacement, array_flip(self::INPUT_FIELDS));
        return $this->transaction(function () use ($id, $replacement, $by) {
            $cashbook = app(CashBookService::class);
            $cashbook->lockInstitution();
            $original = Expense::lockForUpdate()->findOrFail($id);
            if ($original->source !== 'manual' || $original->reversal_of_id !== null || $original->reversals()->exists()) {
                throw new BusinessException(__('errors.expense_not_active'), 'expense_not_active', 409);
            }
            $values = $original->only(self::FIELDS);
            $values['expense_date'] = $original->expense_date->format('Y-m-d');
            $cashbook->assertCashWrite($values['expense_date'], $values['payment_method']);
            if ($replacement !== null) $cashbook->assertCashWrite($replacement['expense_date'] ?? $values['expense_date'], $replacement['payment_method'] ?? $values['payment_method']);
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
