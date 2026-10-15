<?php
namespace Database\Factories;
use App\Models\SalaryAdjustment;
use Illuminate\Database\Eloquent\Factories\Factory;
class SalaryAdjustmentFactory extends Factory {
    protected $model=SalaryAdjustment::class;
    public function definition(): array { return ['payee_type'=>'staff','payee_id'=>fn()=>\App\Models\StaffMember::factory()->create()->id,'kind'=>'allowance','direction'=>'earning','amount'=>'100.00','month'=>'2026-10','status'=>'pending']; }
}
