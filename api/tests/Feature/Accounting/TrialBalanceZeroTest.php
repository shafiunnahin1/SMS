<?php
namespace Tests\Feature\Accounting;
use App\Models\VoucherLine;
use App\Support\Money;

// accounting.md §7: at any moment Σ(Dr - Cr) over all accounts is 0.00
class TrialBalanceZeroTest extends PostingDayTestCase
{
    public function test_trial_balance_is_zero_after_a_full_day_and_a_reversal(): void
    {
        $this->acc()->opening($this->admin,[['account_code'=>'1100','debit'=>'5000.00'],['account_code'=>'1200','debit'=>'7000.00']]);
        $this->day();$this->posting()->repost('2026-10-01','2026-10-31');
        $total=fn()=>Money::format(VoucherLine::get()->sum(fn($l)=>Money::toPaisa((string)$l->debit)-Money::toPaisa((string)$l->credit)));
        $this->assertSame('0.00',$total());
        $this->acc()->reverse($this->admin,\App\Models\Voucher::where('source','expense')->value('id'),'wrong month');
        $this->assertSame('0.00',$total());
    }
}
