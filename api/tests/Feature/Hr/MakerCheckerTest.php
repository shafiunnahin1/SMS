<?php
namespace Tests\Feature\Hr;
use App\Models\{AuditLog,PayrollRun,User};
use Illuminate\Auth\Access\AuthorizationException;

// staff-payroll.md §7.2 / D104: the preparer cannot approve their own run; the audited if_sole_approver default lets a sole admin do it.
class MakerCheckerTest extends PayrollRunTestCase
{
    public function test_accountant_prepares_another_admin_approves_and_the_preparer_cannot(): void
    {
        [$i,$admin,,$accountant]=$this->payroll();
        $run=$this->draft($accountant);
        $this->assertSame(['draft',1],[$run->status,$run->payees_count]);
        $this->runs()->transition($accountant,$run->id,'review');
        try {$this->runs()->transition($accountant,$run->id,'approve');$this->fail('an accountant never approves');}
        catch(AuthorizationException){}
        $approved=$this->runs()->transition($admin,$run->id,'approve');
        $this->assertSame(['approved',false,$admin->id],[$approved->status,$approved->self_approved,$approved->approved_by]);
        $this->assertSame('PS-2026-10-0001',$approved->items->first()->slip_no);
    }

    public function test_sole_admin_self_approval_is_allowed_and_marked_but_not_with_a_second_admin(): void
    {
        [$i,$admin]=$this->payroll();
        $run=$this->draft($admin);$this->runs()->transition($admin,$run->id,'review');
        $approved=$this->runs()->transition($admin,$run->id,'approve');
        $this->assertTrue($approved->self_approved);
        $this->assertTrue((bool)AuditLog::where('action','salary.payroll.approved')->where('model_id',$run->id)->value('new_data')['self_approved']);

        User::create(['institution_id'=>$i->id,'name'=>'Second admin','email'=>'second-admin@example.test','password'=>'Secret@1234','role'=>'admin','is_active'=>true]);
        $other=$this->draft($admin,'2026-10',['label'=>'second']);$this->runs()->transition($admin,$other->id,'review');
        $this->expectException(AuthorizationException::class);
        $this->runs()->transition($admin,$other->id,'approve');
    }

    public function test_never_mode_blocks_even_a_sole_admin(): void
    {
        [$i,$admin]=$this->payroll();
        $i->forceFill(['settings'=>['payroll'=>['allow_self_approval'=>'never']]])->save();$this->bindTenant($i->fresh());
        $run=$this->draft($admin);$this->runs()->transition($admin,$run->id,'review');
        $this->expectException(AuthorizationException::class);
        $this->runs()->transition($admin,$run->id,'approve');
    }
}
