<?php
namespace Tests\Feature\Accounting;
use App\Models\Voucher;

// accounting.md §6 / D106: admin+accountant only, module accounting; budget approval and the period lock are the admin's
class AccountingAccessTest extends AccountingTestCase
{
    public function test_roles_and_module_gate(): void
    {
        $h=$this->hostOf($this->i);
        $this->api('GET',$h,'accounting/accounts',$this->makeUser($this->i,'accountant'))->assertOk()->assertJsonPath('data.0.code','1100');
        foreach(['teacher','parent','institution_staff'] as $role) $this->api('GET',$h,'accounting/accounts',$this->makeUser($this->i,$role))->assertForbidden();
        [$batch]=[$this->makeInstitution('acct-batch','private_batch')];
        $this->api('GET',$this->hostOf($batch),'accounting/accounts',$this->makeUser($batch,'admin'))->assertForbidden()->assertJsonPath('error','module_disabled');
        $this->i->update(['enabled_modules'=>['accounting'=>false]]);
        $this->api('GET',$h,'accounting/vouchers',$this->admin)->assertForbidden()->assertJsonPath('error','module_disabled');
    }

    public function test_voucher_flow_over_http(): void
    {
        $h=$this->hostOf($this->i);$acct=$this->makeUser($this->i,'accountant');
        $lines=[['account_code'=>'5200','debit'=>'250.00'],['account_code'=>'1100','credit'=>'250.00']];
        $this->api('POST',$h,'accounting/vouchers',$acct,['type'=>'payment','date'=>'2026-10-15','lines'=>[['account_code'=>'5200','debit'=>'250.00'],['account_code'=>'1100','credit'=>'249.00']]])
            ->assertStatus(422)->assertJsonPath('error','voucher_unbalanced');
        $id=$this->api('POST',$h,'accounting/vouchers',$acct,['type'=>'payment','date'=>'2026-10-15','narration'=>'Electricity','lines'=>$lines])->assertCreated()->assertJsonPath('data.status','draft')->json('data.id');
        $this->api('POST',$h,"accounting/vouchers/$id/post",$acct)->assertOk()->assertJsonPath('data.voucher_no','PV-2026-00001');
        $this->api('POST',$h,"accounting/vouchers/$id/reverse",$acct,['reason'=>'wrong meter'])->assertOk()->assertJsonPath('data.status','reversed');
        $this->api('POST',$h,"accounting/vouchers/$id/reverse",$acct,['reason'=>'again'])->assertStatus(422)->assertJsonPath('error','already_reversed');
        $this->api('GET',$h,'accounting/reports/trial-balance',$acct)->assertOk();
        $this->bindTenant($this->i);$this->assertSame(2,Voucher::count());
    }

    public function test_budget_approval_and_lock_are_admin_only(): void
    {
        $h=$this->hostOf($this->i);$acct=$this->makeUser($this->i,'accountant');
        $id=$this->api('POST',$h,'accounting/budgets',$acct,['name'=>'FY','fiscal_year'=>'2026-2027'])->assertCreated()->json('data.id');
        $this->api('POST',$h,"accounting/budgets/$id/approve",$acct)->assertForbidden();
        $this->api('POST',$h,"accounting/budgets/$id/approve",$this->admin)->assertOk()->assertJsonPath('data.status','approved');
        $this->api('PUT',$h,'accounting/settings',$acct,['locked_until'=>'2026-10-10','reason'=>'audit'])->assertForbidden();
        $this->api('PUT',$h,'accounting/settings',$this->admin,['locked_until'=>'2026-10-10'])->assertStatus(422);
        $this->api('PUT',$h,'accounting/settings',$this->admin,['locked_until'=>'2026-10-10','reason'=>'September audited'])->assertOk()->assertJsonPath('data.locked_until','2026-10-10');
        $this->api('POST',$h,'accounting/vouchers',$acct,['type'=>'journal','date'=>'2026-10-09','post'=>true,'lines'=>[['account_code'=>'5200','debit'=>'1.00'],['account_code'=>'1100','credit'=>'1.00']]])
            ->assertStatus(422)->assertJsonPath('error','accounting_locked');
    }

    public function test_start_date_is_fixed_once_books_exist_and_opening_balances_balance(): void
    {
        $h=$this->hostOf($this->i);
        $this->api('POST',$h,'accounting/opening-balances',$this->admin,['balances'=>[['account_code'=>'1100','debit'=>'5000.00'],['account_code'=>'1200','debit'=>'20000.00']]])
            ->assertCreated()->assertJsonPath('data.date','2026-10-01');
        $this->api('PUT',$h,'accounting/settings',$this->admin,['start_date'=>'2026-09-01'])->assertStatus(409);
        $this->api('GET',$h,'accounting/reports/trial-balance',$this->admin)->assertOk();
        $this->api('POST',$h,'accounting/repost',$this->admin,['from'=>'2026-10-01','to'=>'2026-10-15'])->assertOk()->assertJsonPath('data.posted',0);
    }
}
