<?php
namespace Database\Factories;
use App\Models\SalaryStructure;
use Illuminate\Database\Eloquent\Factories\Factory;
class SalaryStructureFactory extends Factory
{
    protected $model = SalaryStructure::class;
    public function definition(): array { return ['payee_type'=>'staff','payee_id'=>fn()=>\App\Models\StaffMember::factory()->create()->id,'basic'=>'10000.00','gross'=>'10000.00','effective_from'=>'2026-10-01']; }
}
