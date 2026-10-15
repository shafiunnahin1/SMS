<?php
namespace Tests\Feature\Hr;
use App\Models\{SalaryComponent,SalaryRevision,SalaryStructure,SalaryPayAccount,SalaryAdvance,Teacher,User};
use App\Support\Tenancy;
class SalaryApiTest extends RevisionTestCase
{
    public function test_full_revision_flow_own_history_account_mask_and_actual_letter(): void
    {
        [$i,$admin]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);$host=$this->hostOf($i);
        $component=$this->api('POST',$host,'hr/salary-components',$admin,['code'=>'medical','name'=>['bn'=>'চিকিৎসা','en'=>'Medical','ar'=>'علاج'],'type'=>'earning','calc'=>'fixed'])->assertCreated()->json('data.id');
        $id=$this->api('POST',$host,'hr/revisions',$admin,['payee_type'=>'teacher','payee_id'=>$profile->id,'kind'=>'initial','basic'=>'20000.00',
            'lines'=>[['component_id'=>$component,'value'=>'1500.00']],'effective_from'=>'2026-10-15','arrears_policy'=>'none'])->assertCreated()->json('data.id');
        $this->api('POST',$host,"hr/revisions/{$id}/approve",$admin)->assertOk()->assertJsonPath('data.status','applied');
        $this->api('POST',$host,"hr/revisions/{$id}/approve",$admin)->assertOk();
        $this->api('GET',$host,'hr/people/teacher/'.$profile->id.'/salary',$teacher)->assertOk()->assertJsonPath('data.0.gross','21500.00');
        $pdf=$this->api('GET',$host,"hr/revisions/{$id}/letter.pdf",$admin)->assertOk()->assertHeader('content-type','application/pdf');
        $this->assertStringStartsWith('%PDF-',$pdf->getContent());
        $this->api('PUT',$host,'hr/people/teacher/'.$profile->id.'/pay-accounts',$admin,['accounts'=>[['method'=>'bank','account_number'=>'0000000000000042']]])
            ->assertOk()->assertJsonPath('data.0.masked_number','****0042')->assertJsonMissingPath('data.0.account_number');
        $this->api('PUT',$host,'hr/people/teacher/'.$profile->id.'/pay-accounts',$admin,['accounts'=>[['method'=>'cash']],'payee_id'=>999])->assertUnprocessable();
        $this->api('GET',$host,'hr/people/teacher/'.$profile->id.'/pay-accounts',$teacher)->assertForbidden();
        $this->api('DELETE',$host,'hr/salary-components/'.$component,$admin)->assertConflict();
        Tenancy::as($i,fn()=>$this->assertSame(1,SalaryStructure::count()));
    }

    public function test_super_admin_central_and_tenant_and_impersonated_token_get_sensitive_scope(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$super=$this->makeUser(null,'super_admin');
        foreach([$this->hostOf($i),'admin.'.config('tenancy.base_domain')] as $host){
            $this->api('GET',$host,'hr/revisions',$super)->assertForbidden()->assertJsonPath('error','sensitive_scope');
        }
        $this->app['auth']->forgetGuards();$token=$admin->createToken('support',['impersonated'])->plainTextToken;
        $this->withHeader('Authorization','Bearer '.$token)->getJson('http://'.$this->hostOf($i).'/api/v1/hr/revisions')->assertForbidden()->assertJsonPath('error','sensitive_scope');
    }

    public function test_foreign_routes_and_write_input_are_isolated_and_guarded(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$other=$this->makeInstitution('salary-api-other');
        [$foreign,$component]=Tenancy::as($other,fn()=>[SalaryRevision::factory()->create(),SalaryComponent::factory()->create()]);
        $host=$this->hostOf($i);
        foreach(['approve','reject','cancel'] as $action)$this->api('POST',$host,"hr/revisions/{$foreign->id}/{$action}",$admin)->assertNotFound();
        $this->api('PUT',$host,'hr/salary-components/'.$component->id,$admin,['name'=>['en'=>'Foreign']])->assertNotFound();
        $this->api('POST',$host,'hr/revisions',$admin,['calculation_snapshot'=>['fake'=>true]])->assertUnprocessable();
        $this->api('POST',$host,'hr/salary-components',$admin,['is_system'=>true])->assertUnprocessable();
        $this->api('GET',$host,'hr/revisions',$admin)->assertOk()->assertJsonCount(0,'data');
        $this->api('GET',$host,'hr/revisions')->assertUnauthorized();
        $this->api('GET',$host,'hr/revisions/not-a-number',$admin)->assertNotFound();
    }

    public function test_batch_bonus_and_module_denials_are_http_verified(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$staff->update(['joining_date'=>'2020-01-01']);
        $first=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$first->id,'approve');$host=$this->hostOf($i);
        $token=$this->api('POST',$host,'hr/increment-batches/preview',$admin,['percent'=>'10.00','effective_from'=>'2027-10-01','payee_types'=>['staff']])->assertOk()->json('data.preview_token');
        $this->api('POST',$host,'hr/increment-batches',$admin,['preview_token'=>$token])->assertOk()->assertJsonCount(1,'data');
        $id=$this->api('POST',$host,'hr/bonus-schemes',$admin,['name'=>'Festival','pay_month'=>'2026-10','basis'=>'fixed','value'=>'500.00'])->assertCreated()->json('data.id');
        $this->api('POST',$host,"hr/bonus-schemes/{$id}/preview",$admin)->assertOk()->assertJsonPath('data.0.amount','500.00');
        for($n=0;$n<2;$n++)$this->api('POST',$host,"hr/bonus-schemes/{$id}/apply",$admin)->assertConflict()->assertJsonPath('error','dependency_pending');
        $this->api('POST',$host,"hr/bonus-schemes/{$id}/cancel",$admin)->assertOk()->assertJsonPath('data.status','cancelled');
        $i->update(['enabled_modules'=>['hr_payroll'=>false]]);
        $this->api('GET',$host,'hr/revisions',$admin)->assertForbidden()->assertJsonPath('error','module_disabled');
    }

    public function test_teacher_others_are_forbidden_and_system_seed_is_idempotent(): void
    {
        [$i,$admin,$staff]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);
        $other=\App\Models\Teacher::create(['user_id'=>$admin->id,'employee_id'=>'OTHER-SALARY']);
        $host=$this->hostOf($i);
        $this->api('GET',$host,'hr/people/teacher/'.$other->id.'/salary',$teacher)->assertForbidden();
        $this->api('GET',$host,'hr/people/staff/'.$staff->id.'/salary',$teacher)->assertForbidden();
        $this->api('GET',$host,'hr/revisions',$teacher)->assertForbidden();
        Tenancy::as($i,function(){
            app(\App\Services\Hr\SalaryComponentService::class)->seedDefaults();
            app(\App\Services\Hr\SalaryComponentService::class)->seedDefaults();
            $this->assertSame(3,SalaryComponent::where('is_system',true)->count());
        });
    }
    public function test_teacher_can_only_view_own_salary_advances(): void
    {
        [$i,$admin]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);
        $other=Teacher::create(['user_id'=>$admin->id,'employee_id'=>'OTHER-ADVANCE','status'=>'active']);
        $service=app(\App\Services\Hr\SalaryAdvanceService::class);$ids=[];
        foreach([$profile,$other] as $payee){
            $revision=$this->initial($admin,'teacher',$payee->id);$this->revisionService()->transition($admin,$revision->id,'approve');
            $ids[]=$service->store($admin,['payee_type'=>'teacher','payee_id'=>$payee->id,'amount'=>'10000.00','installments'=>3,'recover_from_month'=>'2026-10'])->id;
        }
        $host=$this->hostOf($i);
        $this->api('GET',$host,'teacher/salary/advances',$admin)->assertForbidden();
        $this->api('GET',$host,'teacher/salary/advances',$teacher)->assertOk()->assertJsonCount(1,'data')
            ->assertJsonPath('data.0.id',$ids[0])->assertJsonMissingPath('data.0.terms_snapshot');
        $this->assertNotSame($ids[0],$ids[1]);
    }

    public function test_advance_http_lifecycle_uses_approval_and_idempotent_disbursement(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$accountant=$this->makeUser($i,'accountant');
        $revision=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$revision->id,'approve');$host=$this->hostOf($i);
        $input=['payee_type'=>'staff','payee_id'=>$staff->id,'amount'=>'12000.00','installments'=>3,'recover_from_month'=>'2026-10'];
        $id=$this->api('POST',$host,'hr/advances',$accountant,$input)->assertCreated()->assertJsonMissingPath('data.terms_snapshot')->json('data.id');
        $this->api('GET',$host,'hr/advances',$accountant)->assertOk()->assertJsonCount(1,'data')->assertJsonPath('data.0.id',$id);
        $this->api('GET',$host,"hr/advances/{$id}",$admin)->assertOk()->assertJsonPath('data.status','requested');
        $this->api('POST',$host,"hr/advances/{$id}/approve",$admin)->assertOk()->assertJsonPath('data.status','approved');
        $disbursement=['date'=>now()->toDateString(),'payment_method'=>'cash'];
        $this->api('POST',$host,"hr/advances/{$id}/disburse",$accountant,$disbursement)->assertOk()->assertJsonPath('data.status','active');
        $this->api('POST',$host,"hr/advances/{$id}/disburse",$accountant,$disbursement)->assertOk()->assertJsonPath('data.status','active');
        Tenancy::as($i,fn()=>$this->assertSame(1,\App\Models\Expense::where('source','advance')->count()));
    }

    public function test_salary_route_uses_existing_web_session_cookie_flow(): void
    {
        [$i,$admin]=$this->setupHr();$host=$this->hostOf($i);
        $this->app['auth']->forgetGuards();
        $login=$this->withHeaders(['Referer'=>'http://'.$host.'/','Accept'=>'application/json'])->postJson('http://'.$host.'/api/v1/auth/login',[
            'login'=>$admin->email,'password'=>'Secret@1234'])->assertOk();
        $cookie=$login->getCookie(config('session.cookie'))->getValue();$this->flushHeaders();$this->app['auth']->forgetGuards();
        $this->withHeaders(['Referer'=>'http://'.$host.'/','Accept'=>'application/json'])->withCredentials()->withCookie(config('session.cookie'),$cookie)
            ->getJson('http://'.$host.'/api/v1/hr/revisions')->assertOk();
    }

    public function test_accountant_proposes_but_only_admin_approves_and_money_input_is_strict(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$accountant=$this->makeUser($i,'accountant');$host=$this->hostOf($i);
        $input=['payee_type'=>'staff','payee_id'=>$staff->id,'kind'=>'initial','basic'=>'20000.00','lines'=>[],'effective_from'=>'2026-10-15','arrears_policy'=>'none'];
        $this->app['auth']->forgetGuards();
        $this->json('POST','http://'.$host.'/api/v1/hr/revisions',array_replace($input,['basic'=>20000.0]),
            ['Authorization'=>'Bearer '.$accountant->createToken('t')->plainTextToken],JSON_PRESERVE_ZERO_FRACTION)->assertUnprocessable();
        $id=$this->api('POST',$host,'hr/revisions',$accountant,$input)->assertCreated()->json('data.id');
        $this->api('POST',$host,"hr/revisions/{$id}/approve",$accountant)->assertForbidden();
        $this->api('POST',$host,"hr/revisions/{$id}/approve",$admin)->assertOk()->assertJsonPath('data.status','applied');
        $this->api('GET',$host,"hr/revisions/{$id}",$admin)->assertOk()->assertJsonMissingPath('data.calculation_snapshot')->assertJsonMissingPath('data.acknowledged_path');
    }

}
