<?php
namespace Database\Factories;
use App\Models\SalaryAdvance;
use Illuminate\Database\Eloquent\Factories\Factory;
class SalaryAdvanceFactory extends Factory {
    protected $model=SalaryAdvance::class;
    public function definition(): array { return ['payee_type'=>'staff','payee_id'=>fn()=>\App\Models\StaffMember::factory()->create()->id,'amount'=>'100.00','installments'=>2,'installment_amount'=>'50.00','recover_from_month'=>'2026-10','terms_snapshot'=>['terms'=>['amount'=>'100.00','installments'=>2],'source'=>null,'policy'=>[]],'status'=>'requested']; }
}
