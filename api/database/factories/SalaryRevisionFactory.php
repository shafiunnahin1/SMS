<?php
namespace Database\Factories;
use App\Models\SalaryRevision;
use Illuminate\Database\Eloquent\Factories\Factory;
class SalaryRevisionFactory extends Factory
{
    protected $model = SalaryRevision::class;
    public function definition(): array { return ['payee_type'=>'staff','payee_id'=>fn()=>\App\Models\StaffMember::factory()->create()->id,'kind'=>'initial','new_basic'=>'10000.00','new_gross'=>'10000.00','calculation_snapshot'=>['source'=>null,'result'=>['basic'=>'10000.00','gross'=>'10000.00','lines'=>[]]],'effective_from'=>'2026-10-01','arrears_policy'=>'none','status'=>'proposed']; }
}
