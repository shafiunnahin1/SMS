<?php
namespace Database\Factories;
use App\Models\Donation;
use Illuminate\Database\Eloquent\Factories\Factory;
class DonationFactory extends Factory
{
    protected $model=Donation::class;
    public function definition(): array { return ['fund_id'=>\App\Models\DonationFund::factory(),'amount'=>'1000.00','method'=>'cash','received_on'=>'2026-10-15','receipt_no'=>$this->faker->unique()->bothify('DON-2026-#####'),'status'=>'received']; }
}
