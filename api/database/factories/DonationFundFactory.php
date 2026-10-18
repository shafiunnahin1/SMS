<?php
namespace Database\Factories;
use App\Models\DonationFund;
use Illuminate\Database\Eloquent\Factories\Factory;
class DonationFundFactory extends Factory
{
    protected $model=DonationFund::class;
    public function definition(): array { return ['name'=>$this->faker->unique()->words(2,true),'kind'=>'general','restricted'=>false]; }
}
