<?php

namespace Database\Factories;

use App\Models\Expense;
use Illuminate\Database\Eloquent\Factories\Factory;

class ExpenseFactory extends Factory
{
    protected $model = Expense::class;
    public function definition(): array
    {
        return ['category' => 'office', 'title' => 'Stationery', 'amount' => '10.00', 'expense_date' => now()->toDateString(),
            'payment_method' => 'cash', 'source' => 'manual'];
    }
}
