<?php
namespace Database\Factories;
use App\Models\DonationCampaign;
use Illuminate\Database\Eloquent\Factories\Factory;
class DonationCampaignFactory extends Factory
{
    protected $model=DonationCampaign::class;
    public function definition(): array { return ['fund_id'=>\App\Models\DonationFund::factory(),'title'=>'Campaign','status'=>'active']; }
}
