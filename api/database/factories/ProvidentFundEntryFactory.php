<?php
namespace Database\Factories;
use App\Models\ProvidentFundEntry;
use Illuminate\Database\Eloquent\Factories\Factory;
class ProvidentFundEntryFactory extends Factory
{
    protected $model=ProvidentFundEntry::class;
    public function definition(): array
    {
        return ['payee_type'=>'staff','payee_id'=>fn()=>\App\Models\StaffMember::factory()->create()->id,'month'=>'2026-10','kind'=>'employee','amount'=>'1000.00'];
    }
}
