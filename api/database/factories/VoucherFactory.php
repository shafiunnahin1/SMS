<?php
namespace Database\Factories;
use App\Models\Voucher;
use Illuminate\Database\Eloquent\Factories\Factory;
class VoucherFactory extends Factory
{
    protected $model=Voucher::class;
    public function definition(): array { return ['voucher_no'=>$this->faker->unique()->bothify('JV-2026-####'),'type'=>'journal','date'=>'2026-10-15','status'=>'draft','source'=>'manual']; }
}
