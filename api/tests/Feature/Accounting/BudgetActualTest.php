<?php
namespace Tests\Feature\Accounting;
use App\Exceptions\BusinessException;
use App\Services\Accounting\{AccountingReportService,BudgetService};
use Illuminate\Auth\Access\AuthorizationException;

// accounting.md §4: used % = actual x 100 / budget (half up); variance = budget - actual; a zero budget has no %
class BudgetActualTest extends AccountingTestCase
{
    public function test_section_4_numbers(): void
    {
        $s=app(BudgetService::class);$b=$s->create($this->admin,['name'=>'FY','fiscal_year'=>'2026-2027']);
        $id=fn($c)=>$this->acc()->account($c)->id;
        $s->lines($this->admin,$b->id,['lines'=>[['account_id'=>$id('5100'),'amount'=>'600000'],['account_id'=>$id('5200'),'amount'=>'60000.00'],
            ['account_id'=>$id('5500'),'amount'=>'24000'],['account_id'=>$id('5900'),'amount'=>'0']]]);
        $this->journal([['account_code'=>'5100','debit'=>'288000.00'],['account_code'=>'5200','debit'=>'71000.00'],['account_code'=>'1200','credit'=>'359000.00']]);
        $rows=collect(app(AccountingReportService::class)->budgetActual($b->id)['rows'])->keyBy('code');
        $this->assertSame(['288000.00','48.00','312000.00'],[$rows['5100']['actual'],$rows['5100']['used_pct'],$rows['5100']['variance']]);
        $this->assertSame(['71000.00','118.33','-11000.00'],[$rows['5200']['actual'],$rows['5200']['used_pct'],$rows['5200']['variance']]);
        $this->assertSame(['0.00','0.00','24000.00'],[$rows['5500']['actual'],$rows['5500']['used_pct'],$rows['5500']['variance']]);
        $this->assertNull($rows['5900']['used_pct']);
    }

    public function test_approval_is_admin_only_and_freezes_the_budget(): void
    {
        $s=app(BudgetService::class);$b=$s->create($this->admin,['name'=>'FY','fiscal_year'=>'2026']);
        try{$s->approve($this->makeUser($this->i,'accountant'),$b->id);$this->fail('non-admin approved');}catch(AuthorizationException){}
        $this->assertSame('approved',$s->approve($this->admin,$b->id)->status);
        try{$s->lines($this->admin,$b->id,['lines'=>[]]);$this->fail('approved budget edited');}catch(BusinessException $e){$this->assertSame(422,$e->status);}
    }
}
