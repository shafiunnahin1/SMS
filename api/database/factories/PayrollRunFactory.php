<?php
namespace Database\Factories;
use App\Models\PayrollRun;
use Illuminate\Database\Eloquent\Factories\Factory;
class PayrollRunFactory extends Factory
{
    protected $model=PayrollRun::class;
    public function definition(): array
    {
        return ['month'=>'2026-10','kind'=>'regular','label'=>$this->faker->unique()->bothify('run-####'),'status'=>'draft','settings_snapshot'=>[]];
    }
}
