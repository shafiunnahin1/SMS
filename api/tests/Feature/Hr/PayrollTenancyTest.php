<?php
namespace Tests\Feature\Hr;
use App\Jobs\GeneratePayrollRun;
use App\Models\{PayrollItem,PayrollRun};
use App\Support\Tenancy;

// staff-payroll.md §17: another institution's run/item is 404; GeneratePayrollRun is a TenantAwareJob (D25)
class PayrollTenancyTest extends PayrollRunTestCase
{
    public function test_runs_and_items_are_invisible_across_institutions(): void
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();
        $run=$this->draft($accountant);$item=$run->items->first();
        $other=$this->makeInstitution('payroll-other');$otherAdmin=$this->makeUser($other,'admin');$host=$this->hostOf($other);
        $this->api('GET',$host,"hr/payroll-runs/{$run->id}",$otherAdmin)->assertNotFound();
        $this->api('POST',$host,"hr/payroll-runs/{$run->id}/review",$otherAdmin)->assertNotFound();
        $this->api('PATCH',$host,"hr/payroll-items/{$item->id}",$otherAdmin,['action'=>'hold','reason'=>'x'])->assertNotFound();
        $this->api('GET',$host,"hr/payroll-items/{$item->id}/slip.pdf",$otherAdmin)->assertNotFound();
        $this->api('GET',$host,'hr/payroll-runs',$otherAdmin)->assertOk()->assertJsonCount(0,'data');
        $this->assertSame(0,Tenancy::as($other,fn()=>PayrollRun::count()+PayrollItem::count()));
    }

    public function test_generation_is_a_tenant_aware_job(): void
    {
        $this->assertContains(\App\Traits\TenantAwareJob::class,class_uses(GeneratePayrollRun::class));
        $job=new GeneratePayrollRun(5,7);
        $this->assertSame(7,$job->institutionId);
        $this->assertInstanceOf(\App\Jobs\Middleware\BindTenant::class,$job->middleware()[0]);
    }
}
