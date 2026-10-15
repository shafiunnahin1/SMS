<?php
namespace Tests\Feature\Hr;
use App\Models\{AuditLog,SalaryPayAccount};
use App\Services\Hr\PayAccountService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Validation\ValidationException;

class SalaryPayAccountTest extends LeaveTestCase
{
    public function test_updates_are_encrypted_masked_tenant_bound_and_default_selection_is_atomic(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$service=app(PayAccountService::class);
        $data=[['method'=>'bank','account_number'=>'0000000000000042'],['method'=>'bkash','account_number'=>'01900000000']];
        $result=$service->update($admin,'staff',$staff->id,$data,'bank');
        $this->assertSame('****0042',$result[0]['masked_number']);
        $this->assertArrayNotHasKey('account_number',$result[0]);
        $this->assertSame(1,SalaryPayAccount::where('is_default',true)->count());
        $service->update($admin,'staff',$staff->id,[['method'=>'bkash','account_name'=>'Account fixture']],'bkash');
        $this->assertSame(1,SalaryPayAccount::where('is_default',true)->count());
        $this->assertSame('bkash',SalaryPayAccount::where('is_default',true)->first()->method);
        $bank=SalaryPayAccount::where('method','bank')->first()->fresh();
        $this->assertNotSame('0000000000000042',$bank->getRawOriginal('account_number'));
        $this->assertSame('0000000000000042',$bank->account_number);
        $audit=AuditLog::where('action','salary.account.updated')->get()->toJson();
        $this->assertStringNotContainsString('0000000000000042',$audit);
        $this->assertStringNotContainsString('Account fixture',$audit);
        $b=$this->makeInstitution('salary-pay-other');$foreign=$this->makeUser($b,'admin');
        $this->expectException(AuthorizationException::class);$service->show($foreign,'staff',$staff->id);
    }

    public function test_invalid_default_and_injected_ownership_ciphertext_do_not_write(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$service=app(PayAccountService::class);
        $service->update($admin,'staff',$staff->id,[['method'=>'bank','account_number'=>'0000000000000042']]);
        $before=SalaryPayAccount::first()->getRawOriginal('account_number');
        foreach([
            [[['method'=>'bank','account_number'=>'0000000000000055']],'nagad'],
            [[['method'=>'bank','institution_id'=>999]],null],
            [[['method'=>'bank','is_default'=>true]],null],
            [['named'=>['method'=>'bank']],null],
            [[['method'=>'bank','account_number'=>encrypt('ciphertext fixture')]],null],
        ] as [$accounts,$default]){
            try{$service->update($admin,'staff',$staff->id,$accounts,$default);$this->fail('Invalid account accepted');}
            catch(ValidationException $e){$this->assertNotEmpty($e->errors());}
            $this->assertSame($before,SalaryPayAccount::first()->getRawOriginal('account_number'));
            $this->assertSame(1,SalaryPayAccount::count());
        }
    }

    public function test_teacher_cannot_read_or_write_pay_accounts_even_for_own_profile(): void
    {
        [$i]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);$service=app(PayAccountService::class);
        try{$service->show($teacher,'teacher',$profile->id);$this->fail('Teacher read account');}
        catch(AuthorizationException $e){$this->assertSame(0,SalaryPayAccount::count());}
        $this->expectException(AuthorizationException::class);$service->update($teacher,'teacher',$profile->id,[['method'=>'cash']]);
    }
}
