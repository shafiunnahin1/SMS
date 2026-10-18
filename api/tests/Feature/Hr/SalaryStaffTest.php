<?php
namespace Tests\Feature\Hr;
use App\Models\{SalaryRevision,Teacher,User};
use App\Services\DepartmentService;
use App\Support\Tenancy;

// D101 (owner, 2026-10-17): department staff do HR/payroll work behind exact per-area keys; every approval,
// bonus apply, pay-account edit and staff-record change stays admin-only, and staff never write their own pay row.
class SalaryStaffTest extends RevisionTestCase
{
    private function staff($i, User $admin, array $keys): array
    {
        $i->forceFill(['staff_department_mode'=>'department'])->save();
        $staff=$this->makeUser($i,'institution_staff');
        [$department,$own]=Tenancy::as($i,function() use ($admin,$staff,$keys){
            $s=app(DepartmentService::class);
            $d=$s->create($admin,['name'=>'HR']);
            $m=$s->addMember($admin,$d->id,['user_id'=>$staff->id]);
            $duty=$s->createDuty($admin,$d->id,['code'=>'HR','name'=>'HR','permission_keys'=>$keys]);
            $s->assignDuties($admin,$m->id,['duty_ids'=>[$duty->id]]);
            return [$d->id,Teacher::create(['user_id'=>$staff->id,'employee_id'=>'HR-OWN','status'=>'active'])];
        });
        return [$staff,$department,$own];
    }

    private function asStaff($i, User $staff, $department, string $method, string $path, array $body=[])
    {
        $this->app['auth']->forgetGuards();
        $headers=['Authorization'=>'Bearer '.$staff->createToken('hr')->plainTextToken];
        if($department!==null) $headers['X-Department-Id']=(string)$department;
        return $this->json($method,'http://'.$this->hostOf($i).'/api/v1/'.$path,$body,$headers);
    }

    private function revision(int $payeeId, int $component): array
    {
        return ['payee_type'=>'teacher','payee_id'=>$payeeId,'kind'=>'initial','basic'=>'20000.00',
            'lines'=>[['component_id'=>$component,'value'=>'1500.00']],'effective_from'=>'2026-10-15','arrears_policy'=>'none'];
    }

    public function test_staff_draft_pay_for_others_but_never_approve_or_touch_their_own(): void
    {
        [$i,$admin]=$this->setupHr();[,$profile]=$this->teacher($i);
        [$staff,$d,$own]=$this->staff($i,$admin,['staff.salary_component.store','staff.salary_component.index','staff.salary_revision.store','staff.salary_revision.index','staff.salary_revision.show','staff.pay_account.show']);

        $component=$this->asStaff($i,$staff,$d,'POST','hr/salary-components',['code'=>'medical','name'=>['bn'=>'চিকিৎসা','en'=>'Medical','ar'=>'علاج'],'type'=>'earning','calc'=>'fixed'])->assertCreated()->json('data.id');
        $this->asStaff($i,$staff,$d,'GET','hr/salary-components')->assertOk();
        $id=$this->asStaff($i,$staff,$d,'POST','hr/revisions',$this->revision($profile->id,$component))->assertCreated()->json('data.id');
        $this->asStaff($i,$staff,$d,'GET',"hr/revisions/{$id}")->assertOk();
        $this->asStaff($i,$staff,$d,'GET','hr/people/teacher/'.$profile->id.'/pay-accounts')->assertOk();

        // approvals, pay-account edits and staff-record writes stay admin-only whatever the duty says
        $this->asStaff($i,$staff,$d,'POST',"hr/revisions/{$id}/approve")->assertForbidden();
        $this->asStaff($i,$staff,$d,'POST',"hr/revisions/{$id}/reject")->assertForbidden();
        $this->asStaff($i,$staff,$d,'PUT','hr/people/teacher/'.$profile->id.'/pay-accounts',['accounts'=>[['method'=>'cash']]])->assertForbidden();
        $this->asStaff($i,$staff,$d,'POST','hr/staff',['name'=>'X'])->assertForbidden();
        // never their own pay row
        $this->asStaff($i,$staff,$d,'POST','hr/revisions',$this->revision($own->id,$component))->assertForbidden();
        $this->assertSame(1,Tenancy::as($i,fn()=>SalaryRevision::count()));
        $this->assertSame('proposed',Tenancy::as($i,fn()=>SalaryRevision::findOrFail($id)->status));
        $this->api('POST',$this->hostOf($i),"hr/revisions/{$id}/approve",$admin)->assertOk()->assertJsonPath('data.status','applied');
    }

    public function test_staff_hr_fails_closed_without_key_context_or_department_mode(): void
    {
        [$i,$admin]=$this->setupHr();
        [$staff,$d]=$this->staff($i,$admin,['staff.salary_component.index']);
        $this->asStaff($i,$staff,$d,'GET','hr/revisions')->assertForbidden();
        $this->asStaff($i,$staff,$d,'POST','hr/salary-components',['code'=>'x'])->assertForbidden();   // 403 before validation
        $this->asStaff($i,$staff,null,'GET','hr/salary-components')->assertForbidden();
        $this->asStaff($i,$staff,999999,'GET','hr/salary-components')->assertForbidden();
        $this->asStaff($i,$staff,$d,'GET','hr/salary-components')->assertOk();
        $i->forceFill(['staff_department_mode'=>'legacy'])->save();
        $this->asStaff($i,$staff,$d,'GET','hr/salary-components')->assertForbidden();
    }
}
