<?php
namespace Tests\Feature\Accounting;
use App\Models\{LedgerAccount,VoucherLine};
use App\Services\CashBookService;
use App\Support\Money;

// accounting.md §3/§7, refs_r12.py ledger_cash_vs_cashbook: the ledger's 1100 equals the cash book's expected closing; bKash goes to
// 1300 and never touches cash. The reference day closes at 19,400.00 including a 10,000 cash donation (R3.11, not built yet), so this
// day without it closes at 9,400.00 - the same rule, checked against the live cash book.
class LedgerCashEqualsCashBookTest extends PostingDayTestCase
{
    public function test_ledger_cash_equals_the_cash_book_and_bkash_stays_out_of_cash(): void
    {
        $this->acc()->opening($this->admin,[['account_code'=>'1100','debit'=>'5000.00']]);
        $this->day();
        $result=$this->posting()->repost('2026-10-01','2026-10-31');
        $this->assertSame([7,[]],[$result['posted'],$result['failed']]);
        $balance=fn(string $code)=>VoucherLine::where('account_id',LedgerAccount::where('code',$code)->value('id'))->get()
            ->sum(fn($l)=>Money::toPaisa((string)$l->debit)-Money::toPaisa((string)$l->credit));
        $cashbook=app(CashBookService::class)->show('2026-10-15','5000.00');
        $this->assertSame('9400.00',$cashbook['expected_closing'],'5,000 + 12,000 + 1,500 + 2,400 - 500 - 3,000 - 8,000');
        $this->assertSame($cashbook['expected_closing'],Money::format($balance('1100')));
        $this->assertSame('4000.00',Money::format($balance('1300')),'the bKash receipt is mobile money, not cash');
    }
}
