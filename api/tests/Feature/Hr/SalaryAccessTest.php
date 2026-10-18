<?php
namespace Tests\Feature\Hr;
use App\Exceptions\BusinessException;
use App\Models\{StaffMember,Teacher};
use App\Services\Hr\SalaryAccess;
use Illuminate\Auth\Access\AuthorizationException;

class SalaryAccessTest extends LeaveTestCase
{
    public function test_teacher_reads_only_own_profile_and_staff_and_other_teacher_are_forbidden(): void
    {
        [$i,$admin,$staff]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);
        $access=app(SalaryAccess::class);
        $this->assertSame($profile->id,$access->payee($teacher,'teacher',$profile->id,true)->id);
        $other=Teacher::create(['user_id'=>$admin->id,'employee_id'=>'OTHER']);
        foreach([['teacher',$other->id],['staff',$staff->id]] as [$type,$id]){
            try{$access->payee($teacher,$type,$id,true);$this->fail('Teacher read another payee');}
            catch(AuthorizationException $e){$this->assertTrue(true);}
        }
        $this->expectException(AuthorizationException::class);$access->payee($teacher,'teacher',$profile->id);
    }

    public function test_super_admin_and_explicit_impersonated_token_fail_sensitive_scope_before_tenant_query(): void
    {
        [$i,$admin]=$this->setupHr();$access=app(SalaryAccess::class);
        foreach([$this->makeUser(null,'super_admin'),$admin->withAccessToken($admin->createToken('support',['impersonated'])->accessToken)] as $actor){
            $queries=[];\Illuminate\Support\Facades\DB::listen(function($query)use(&$queries){$queries[]=$query->sql;});
            try{$access->actor($actor);$this->fail('Sensitive scope accepted');}
            catch(BusinessException $e){$this->assertSame('sensitive_scope',$e->errorCode);$this->assertSame(403,$e->status);}
            $this->assertSame([],$queries);
        }
        $admin->withAccessToken($admin->createToken('ordinary',['*'])->accessToken);
        $this->assertSame($admin->id,$access->actor($admin)->id);
    }

    public function test_unprivileged_disabled_and_foreign_tenant_actors_cannot_read(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$access=app(SalaryAccess::class);
        foreach(['student','parent'] as $role){
            try{$access->payee($this->makeUser($i,$role),'staff',$staff->id);$this->fail('Unauthorized actor');}
            catch(AuthorizationException $e){$this->assertTrue(true);}
        }
        $b=$this->makeInstitution('salary-access-other');$foreign=$this->asTenant($b,fn()=>StaffMember::factory()->create());
        try{$access->payee($admin,'staff',$foreign->id);$this->fail('Foreign payee resolved');}
        catch(\Illuminate\Database\Eloquent\ModelNotFoundException $e){$this->assertSame(StaffMember::class,$e->getModel());}
        $i->update(['enabled_modules'=>['hr_payroll'=>false]]);
        $this->expectException(BusinessException::class);$this->expectExceptionMessage(__('errors.module_disabled'));$access->payee($admin,'staff',$staff->id);
    }
}
