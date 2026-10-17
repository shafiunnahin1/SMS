<?php
namespace Database\Factories;
use App\Models\SalaryComponent;
use Illuminate\Database\Eloquent\Factories\Factory;
class SalaryComponentFactory extends Factory
{
    protected $model = SalaryComponent::class;
    public function definition(): array { return ['code'=>fake()->unique()->bothify('fixture_????####'),'name'=>['bn'=>'উপাদান','en'=>'Component','ar'=>'مكون'],'type'=>'earning','calc'=>'fixed']; }
}
