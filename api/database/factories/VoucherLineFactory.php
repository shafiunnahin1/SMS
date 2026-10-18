<?php
namespace Database\Factories;
use App\Models\VoucherLine;
use Illuminate\Database\Eloquent\Factories\Factory;
class VoucherLineFactory extends Factory
{
    protected $model=VoucherLine::class;
    public function definition(): array { return ['voucher_id'=>\App\Models\Voucher::factory(),'account_id'=>\App\Models\LedgerAccount::factory(),'debit'=>'100.00','credit'=>'0.00']; }
}
