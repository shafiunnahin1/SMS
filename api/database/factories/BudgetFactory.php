<?php
namespace Database\Factories;
use App\Models\Budget;
use Illuminate\Database\Eloquent\Factories\Factory;
class BudgetFactory extends Factory
{
    protected $model=Budget::class;
    public function definition(): array { return ['name'=>$this->faker->unique()->words(2,true),'fiscal_year'=>'2026','status'=>'draft']; }
}
