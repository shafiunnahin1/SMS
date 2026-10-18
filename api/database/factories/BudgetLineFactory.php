<?php
namespace Database\Factories;
use App\Models\BudgetLine;
use Illuminate\Database\Eloquent\Factories\Factory;
class BudgetLineFactory extends Factory
{
    protected $model=BudgetLine::class;
    public function definition(): array { return ['budget_id'=>\App\Models\Budget::factory(),'account_id'=>\App\Models\LedgerAccount::factory(),'amount'=>'1000.00']; }
}
