<?php
namespace Database\Factories;
use App\Models\Donor;
use Illuminate\Database\Eloquent\Factories\Factory;
class DonorFactory extends Factory
{
    protected $model=Donor::class;
    public function definition(): array { return ['name'=>$this->faker->name(),'phone'=>$this->faker->unique()->numerify('017########'),'type'=>'individual']; }
}
