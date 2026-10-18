<?php
namespace Tests\Feature\Accounting;
use App\Exceptions\BusinessException;
use App\Services\Accounting\BankReconciliationService;
use Illuminate\Validation\ValidationException;

// accounting.md §5: statement rows suggest matches by amount within ±3 days; a ledger line is reconciled once
class BankReconcileTest extends AccountingTestCase
{
    public function test_import_suggests_match_and_a_line_matches_once(): void
    {
        $this->journal([['account_code'=>'1200','debit'=>'5000.00'],['account_code'=>'3100','credit'=>'5000.00']],'2026-10-10');
        $this->journal([['account_code'=>'5200','debit'=>'1200.00'],['account_code'=>'1200','credit'=>'1200.00']],'2026-10-12');
        $bank=$this->acc()->account('1200')->id;$svc=app(BankReconciliationService::class);
        $r=$svc->import($bank,"date,description,debit,credit,reference\n2026-10-12,deposit,,5000.00,DEP1\n2026-10-13,cheque,1200.00,,CHQ9\n2026-10-30,deposit,,5000.00,LATE\n");
        $this->assertCount(2,$r['matches']);$this->assertSame(['LATE'],array_column($r['unmatched_statement'],'reference'));
        $line=$r['matches'][0]['line_id'];
        $this->assertSame('DEP1',$svc->match($this->admin,$bank,['line_id'=>$line,'reference'=>'DEP1'])['reconciled_ref']);
        try{$svc->match($this->admin,$bank,['line_id'=>$line,'reference'=>'X']);$this->fail('matched twice');}catch(BusinessException $e){$this->assertSame('already_reconciled',$e->errorCode);}
        $this->assertCount(1,$svc->show($bank)['unreconciled']);
        $svc->unmatch($this->admin,$bank,['line_id'=>$line]);$this->assertCount(2,$svc->show($bank)['unreconciled']);
    }

    public function test_cash_drawer_is_not_reconciled(): void
    {
        $this->expectException(ValidationException::class);
        app(BankReconciliationService::class)->show($this->acc()->account('1100')->id);
    }
}
