<?php
namespace Tests\Feature\Hr;
use App\Models\{AuditLog,SalaryAdvance};
use App\Services\Hr\PayrollApproval;
use Illuminate\Auth\Access\AuthorizationException;
class PayrollApprovalTest extends LeaveTestCase
{
    public function test_configured_maker_checker_modes_and_admin_only_authorization(): void
    {
        [$i,$admin]=$this->setupHr();$service=app(PayrollApproval::class);$policy=$service->policy();
        $this->assertTrue($service->authorize($admin,$admin->id,$policy));
        $other=$this->makeUser($i,'accountant');
        try{$service->authorize($other,$admin->id,$policy);$this->fail('Accountant approved');}catch(AuthorizationException){$this->assertTrue(true);}
        $other->update(['role'=>'admin']);
        try{$service->authorize($admin,$admin->id,$policy);$this->fail('Non-sole self approval');}catch(AuthorizationException){$this->assertTrue(true);}
        $this->assertFalse($service->authorize($other,$admin->id,$policy));
        $policy['allow_self_approval']='always';$this->assertTrue($service->authorize($admin,$admin->id,$policy));
        $policy['allow_self_approval']='never';
        $this->expectException(AuthorizationException::class);$service->authorize($admin,$admin->id,$policy);
    }
    public function test_audit_has_only_explicit_policy_marker_and_no_financial_snapshot(): void
    {
        [$i,$admin]=$this->setupHr();$row=SalaryAdvance::factory()->create();
        app(PayrollApproval::class)->audit($admin,$row,'advance.approved',['self_approved'=>true]);
        $audit=AuditLog::where('action','salary.advance.approved')->firstOrFail();
        $this->assertSame(['self_approved'=>true],$audit->new_data);$this->assertSame($admin->id,$audit->user_id);
        $this->assertStringNotContainsString('100.00',$audit->toJson());
    }
    public function test_malformed_money_policy_fails_closed(): void
    {
        [$i]=$this->setupHr();$i->update(['settings'=>['payroll'=>['min_net_after_recovery'=>'invalid']]]);
        $this->expectException(\Illuminate\Validation\ValidationException::class);app(PayrollApproval::class)->policy();
    }
}
