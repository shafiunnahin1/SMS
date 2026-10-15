<?php
namespace Database\Factories;
use App\Models\SalaryStructureLine;
use Illuminate\Database\Eloquent\Factories\Factory;
class SalaryStructureLineFactory extends Factory
{
    protected $model = SalaryStructureLine::class;
    public function definition(): array { return ['structure_id'=>fn()=>\App\Models\SalaryStructure::factory()->create()->id,'component_id'=>fn()=>\App\Models\SalaryComponent::factory()->create()->id,'mode'=>'fixed','value'=>'100.00']; }
}
