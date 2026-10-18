<?php
namespace Tests\Feature\Donations;
use App\Exceptions\BusinessException;
use App\Models\Expense;

// donations.md §2.3 / D39: a restricted fund cannot be overdrawn - 10,000 in, 7,000 spent, a further 4,000 refused; a general fund is not guarded
class FundGuardTest extends DonationTestCase
{
    public function test_restricted_fund_overdraw_is_refused(): void
    {
        $f=$this->fund();$this->give($f,'10000.00');
        $this->spend($f,'7000.00');
        $this->assertSame(300000,$this->svc()->balance($f->id)['balance']);
        try{$this->spend($f,'4000.00');$this->fail('overdrawn');}catch(BusinessException $e){$this->assertSame([422,'fund_overdrawn'],[$e->status,$e->errorCode]);}
        $this->assertSame(1,Expense::where('fund_id',$f->id)->count());
        $this->spend($f,'3000.00');$this->assertSame(0,$this->svc()->balance($f->id)['balance']);
    }

    public function test_general_fund_balance_is_information_only(): void
    {
        $f=$this->fund(false,'General');$this->give($f,'1000.00');
        $this->spend($f,'4000.00');
        $this->assertSame(-300000,$this->svc()->balance($f->id)['balance']);
    }

    public function test_a_cancelled_fund_expense_returns_its_money(): void
    {
        $f=$this->fund();$this->give($f,'5000.00');$e=$this->spend($f,'5000.00');
        app(\App\Services\ExpenseService::class)->correct($e->id,null,$this->admin->id);
        $this->assertSame(500000,$this->svc()->balance($f->id)['balance']);
    }
}
