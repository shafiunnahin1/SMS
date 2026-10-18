<?php
namespace Tests\Feature\Donations;
use App\Models\{LedgerAccount,VoucherLine};
use App\Services\Accounting\AccountingPostingService;
use App\Support\Money;

// donations.md §2.5/§5: with accounting on, donations post to 4300.<fund_id>; the fund's net donations equal that ledger account, and
// the fund balance equals it less the fund's expenses (which post to their own expense accounts, accounting.md §3)
class FundBalanceEqualsLedgerTest extends DonationTestCase
{
    public function test_fund_balance_matches_the_ledger(): void
    {
        $this->i->forceFill(['settings'=>array_replace_recursive($this->i->fresh()->settings,['accounting'=>['start_date'=>'2026-10-01']])])->save();
        $this->bindTenant($this->i->fresh());
        $f=$this->fund();
        $d=$this->give($f,'10000.00');$this->give($f,'2500.00',['method'=>'bkash']);
        $this->svc()->reverse($this->admin,$d->id,['reason'=>'cheque bounced']);$this->give($f,'10000.00');
        $this->spend($f,'7000.00');
        app(AccountingPostingService::class)->repost('2026-10-01','2026-10-31');
        $credit=VoucherLine::where('account_id',LedgerAccount::where('code','4300.'.$f->id)->value('id'))->get()
            ->sum(fn($l)=>Money::toPaisa((string)$l->credit)-Money::toPaisa((string)$l->debit));
        $b=$this->svc()->balance($f->id);
        $this->assertSame(1250000,$credit);
        $this->assertSame($b['received']-$b['reversed'],$credit);
        $this->assertSame($credit-$b['spent'],$b['balance']);
        $this->assertSame('550000',(string)$b['balance']);
    }
}
