<?php
namespace Database\Factories;
use App\Models\BonusScheme;
use Illuminate\Database\Eloquent\Factories\Factory;
class BonusSchemeFactory extends Factory
{
    protected $model = BonusScheme::class;
    public function definition(): array { return ['name'=>'Fixture bonus','pay_month'=>'2026-10','basis'=>'fixed','value'=>'100.00','status'=>'draft']; }
}
