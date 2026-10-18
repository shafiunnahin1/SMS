<?php

namespace Database\Factories;

use App\Models\CashBookClosing;
use Illuminate\Database\Eloquent\Factories\Factory;

class CashBookClosingFactory extends Factory
{
    protected $model = CashBookClosing::class;
    public function definition(): array
    {
        return ['date' => now()->toDateString(), 'revision' => 1, 'opening_cash' => '0.00', 'cash_in' => '0.00',
            'cash_out' => '0.00', 'expected_closing' => '0.00', 'counted_cash' => '0.00', 'difference' => '0.00',
            'status' => 'closed', 'closed_at' => now()];
    }
}
