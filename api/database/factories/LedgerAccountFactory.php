<?php
namespace Database\Factories;
use App\Models\LedgerAccount;
use Illuminate\Database\Eloquent\Factories\Factory;
class LedgerAccountFactory extends Factory
{
    protected $model=LedgerAccount::class;
    public function definition(): array { return ['code'=>$this->faker->unique()->numerify('9###'),'name'=>'Fixture account','type'=>'expense']; }
}
