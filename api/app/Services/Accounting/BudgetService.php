<?php

namespace App\Services\Accounting;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Budget, BudgetLine, LedgerAccount, User};
use App\Support\{Money, Tenancy};
use Illuminate\Support\Facades\{DB, Validator};
use Illuminate\Validation\ValidationException;

/** R3.10 (accounting.md §4): a budget is edited while draft; approval (admin only) freezes it */
class BudgetService
{
    public function create(User $actor, array $input): Budget
    {
        if (array_diff(array_keys($input), ['name', 'fiscal_year'])) $this->invalid('budget');
        $data = Validator::make($input, ['name' => 'required|string|max:100', 'fiscal_year' => 'required|string|max:9'])->validate();
        AccountingReportService::fiscalRange($data['fiscal_year']);
        if (Budget::where('name', $data['name'])->where('fiscal_year', $data['fiscal_year'])->exists()) throw new BusinessException(__('accounting.conflict'), 'accounting_conflict', 409);
        $budget = Budget::create($data + ['status' => 'draft']);
        $this->audit($actor, $budget, 'created');
        return $budget;
    }

    public function update(User $actor, int $id, array $input): Budget
    {
        if (array_diff(array_keys($input), ['name'])) $this->invalid('budget');
        $data = Validator::make($input, ['name' => 'required|string|max:100'])->validate();
        $budget = $this->draft($id); $budget->fill($data)->save(); $this->audit($actor, $budget, 'updated');
        return $budget;
    }

    /** replaces all lines of a draft: [{account_id, amount}] */
    public function lines(User $actor, int $id, array $input): Budget
    {
        $data = Validator::make($input, ['lines' => 'present|array|max:500', 'lines.*.account_id' => 'required|integer|distinct', 'lines.*.amount' => ['required', 'regex:/^\d{1,10}(\.\d{1,2})?$/']])->validate();
        return DB::transaction(function () use ($actor, $id, $data) {
            $budget = $this->draft($id);
            BudgetLine::where('budget_id', $budget->id)->delete();
            foreach ($data['lines'] as $l) {
                LedgerAccount::findOrFail($l['account_id']);
                BudgetLine::create(['budget_id' => $budget->id, 'account_id' => $l['account_id'], 'amount' => Money::format(Money::toPaisa((string) $l['amount']))]);
            }
            $this->audit($actor, $budget, 'lines');
            return $budget->load('lines');
        });
    }

    public function approve(User $actor, int $id): Budget
    {
        if ($actor->role !== 'admin') throw new \Illuminate\Auth\Access\AuthorizationException();
        $budget = Budget::findOrFail($id);
        if ($budget->status === 'approved') return $budget;
        if ($budget->status !== 'draft') throw new BusinessException(__('accounting.conflict'), 'accounting_conflict', 409);
        $budget->status = 'approved'; $budget->save(); $this->audit($actor, $budget, 'approved');
        return $budget;
    }

    private function draft(int $id): Budget
    {
        $budget = Budget::findOrFail($id);
        if ($budget->status !== 'draft') throw new BusinessException(__('accounting.voucher_final'), 'budget_final', 422);
        return $budget;
    }

    private function audit(User $actor, Budget $budget, string $event): void
    {
        AuditLog::create(['institution_id' => Tenancy::current()->id, 'user_id' => $actor->id, 'action' => 'accounting.budget.'.$event, 'model' => 'Budget', 'model_id' => $budget->id, 'new_data' => []]);
    }

    private function invalid(string $field): never { throw ValidationException::withMessages([$field => __('accounting.invalid')]); }
}
