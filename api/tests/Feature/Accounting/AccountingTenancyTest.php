<?php
namespace Tests\Feature\Accounting;
use App\Models\{Budget,LedgerAccount,Voucher};
use App\Support\Tenancy;

// accounting.md §6 / D106: one institution never sees or touches another's accounts, vouchers, budgets or reports
class AccountingTenancyTest extends AccountingTestCase
{
    public function test_foreign_rows_are_404_and_lists_are_own_only(): void
    {
        $other=$this->makeInstitution('acct-other');
        [$acc,$vid,$bid]=Tenancy::as($other,function(){
            $a=LedgerAccount::factory()->create(['type'=>'asset','is_cash_or_bank'=>true]);
            return [$a->id,Voucher::factory()->create(['voucher_no'=>'JV-2026-99999'])->id,Budget::factory()->create()->id];
        });
        $this->journal([['account_code'=>'5200','debit'=>'10.00'],['account_code'=>'1100','credit'=>'10.00']]);
        $h=$this->hostOf($this->i);
        $this->api('GET',$h,"accounting/reports/ledger?account_id=$acc&from=2026-10-01",$this->admin)->assertNotFound();
        $this->api('GET',$h,"accounting/reports/budget-actual?budget_id=$bid",$this->admin)->assertNotFound();
        $this->api('GET',$h,"accounting/vouchers/$vid",$this->admin)->assertNotFound();
        $this->api('POST',$h,"accounting/bank-reconciliation/$acc/import",$this->admin,['csv'=>'date,description,debit,credit,reference'])->assertNotFound();
        $this->api('POST',$h,'accounting/vouchers',$this->admin,['type'=>'journal','date'=>'2026-10-15','lines'=>[['account_id'=>$acc,'debit'=>'1.00'],['account_code'=>'1100','credit'=>'1.00']]])->assertStatus(422);
        $list=$this->api('GET',$h,'accounting/vouchers',$this->admin)->assertOk()->json('data');
        $this->assertSame(['JV-2026-00001'],array_column($list,'voucher_no'));
        $this->assertNotContains($acc,array_column($this->api('GET',$h,'accounting/accounts',$this->admin)->json('data'),'id'));
    }
}
