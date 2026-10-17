<?php
namespace Database\Factories;
use App\Models\SalaryPayAccount;
use Illuminate\Database\Eloquent\Factories\Factory;
class SalaryPayAccountFactory extends Factory
{
    protected $model = SalaryPayAccount::class;
    public function definition(): array { return ['payee_type'=>'staff','payee_id'=>fn()=>\App\Models\StaffMember::factory()->create()->id,'method'=>'bank','account_number'=>'0000000000000042','is_default'=>true]; }
}
