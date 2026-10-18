<?php
namespace Database\Factories;
use App\Models\{PayrollItem,PayrollRun};
use Illuminate\Database\Eloquent\Factories\Factory;
class PayrollItemFactory extends Factory
{
    protected $model=PayrollItem::class;
    public function definition(): array
    {
        return ['run_id'=>PayrollRun::factory(),'payee_type'=>'teacher','payee_id'=>$this->faker->unique()->numberBetween(1,999999),'days_in_month'=>31,
            'basic'=>'20000.00','gross'=>'30500.00','total_earnings'=>'30500.00','total_deductions'=>'0.00','net'=>'30500.00','breakdown'=>[]];
    }
}
