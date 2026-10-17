<?php
namespace Tests\Feature\Hr;
use App\Models\{AuditLog,PayrollItem,SalaryPayAccount,Teacher,User};

// R3.7 / D104 over HTTP: accountant prepares, admin approves, pay, slip PDF, disbursement CSV (audited), teacher sees only own slips.
class PayrollApiTest extends PayrollRunTestCase
{
    private function teacherPayee($i,$admin,string $code): array
    {
        $u=User::create(['institution_id'=>$i->id,'name'=>'Teacher '.$code,'email'=>"t-$code@example.test",'password'=>'Secret@1234','role'=>'teacher','is_active'=>true]);
        $t=Teacher::create(['user_id'=>$u->id,'employee_id'=>'T-'.$code,'status'=>'active']);
        $r=$this->initial($admin,'teacher',$t->id);$this->revisionService()->transition($admin,$r->id,'approve');
        SalaryPayAccount::factory()->create(['payee_type'=>'teacher','payee_id'=>$t->id,'account_number'=>'0000000000009'.$code]);
        return [$u,$t];
    }

    public function test_full_run_over_http_with_slip_csv_and_teacher_own_access(): void
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();$host=$this->hostOf($i);
        [$teacherUser,$teacher]=$this->teacherPayee($i,$admin,'1');[$otherUser,$other]=$this->teacherPayee($i,$admin,'2');
        $id=$this->api('POST',$host,'hr/payroll-runs',$accountant,['month'=>'2026-10'])->assertCreated()->assertJsonPath('data.status','draft')->json('data.id');
        $this->api('GET',$host,'hr/payroll-runs',$accountant)->assertOk()->assertJsonPath('data.0.id',$id);
        $this->api('POST',$host,"hr/payroll-runs/$id/review",$accountant)->assertOk()->assertJsonPath('data.status','reviewed');
        $this->api('POST',$host,"hr/payroll-runs/$id/approve",$accountant)->assertForbidden();
        $this->api('POST',$host,"hr/payroll-runs/$id/approve",$admin)->assertOk()->assertJsonPath('data.status','approved');
        $this->api('POST',$host,"hr/payroll-runs/$id/recompute",$accountant)->assertStatus(422);

        $this->bindTenant($i);
        $mine=PayrollItem::where('run_id',$id)->where('payee_type','teacher')->where('payee_id',$teacher->id)->firstOrFail();
        $theirs=PayrollItem::where('run_id',$id)->where('payee_type','teacher')->where('payee_id',$other->id)->firstOrFail();
        $this->api('POST',$host,"hr/payroll-runs/$id/pay",$accountant,['item_ids'=>[$mine->id,$theirs->id],'reference'=>'B-1'])->assertOk();
        $pdf=$this->api('GET',$host,"hr/payroll-items/{$mine->id}/slip.pdf",$accountant)->assertOk()->assertHeader('content-type','application/pdf');
        $this->assertStringStartsWith('%PDF-',$pdf->getContent());

        $csv=$this->api('GET',$host,"hr/payroll-runs/$id/disbursement.csv",$admin)->assertOk();
        $this->assertStringContainsString('payee,method,account_name,account_number',$csv->getContent());
        $this->assertStringContainsString('00000000000091',$csv->getContent());
        $this->bindTenant($i);
        $this->assertSame(1,AuditLog::where('action','salary.payroll.downloaded')->count());
        $this->assertStringNotContainsString('00000000000091',json_encode(AuditLog::pluck('new_data')),'no account number in audit');

        $this->api('GET',$host,'teacher/salary/slips',$teacherUser)->assertOk()->assertJsonCount(1,'data')->assertJsonPath('data.0.id',$mine->id);
        $this->api('GET',$host,"teacher/salary/slips/{$mine->id}.pdf",$teacherUser)->assertOk();
        $this->api('GET',$host,"teacher/salary/slips/{$theirs->id}.pdf",$teacherUser)->assertForbidden();
        $this->api('GET',$host,'teacher/salary',$teacherUser)->assertOk()->assertJsonPath('data.latest.id',$mine->id);
        $this->api('GET',$host,'teacher/salary/history',$teacherUser)->assertOk()->assertJsonCount(1,'data');
        $this->api('GET',$host,'hr/payroll-runs',$teacherUser)->assertForbidden();
        $this->api('GET',$host,'hr/reports/held',$accountant)->assertOk();
        $this->api('PATCH',$host,"hr/payroll-items/{$mine->id}",$accountant,['action'=>'returned','reason'=>'account closed'])->assertOk()->assertJsonPath('data.status','failed');
    }

    public function test_super_admin_and_impersonated_tokens_get_sensitive_scope(): void
    {
        [$i,$admin]=$this->payroll();$host=$this->hostOf($i);
        $super=$this->makeUser(null,'super_admin');
        $this->api('GET',$host,'hr/payroll-runs',$super)->assertForbidden();
        $this->app['auth']->forgetGuards();
        $token=$admin->createToken('support',['impersonated'])->plainTextToken;
        $this->json('GET','http://'.$host.'/api/v1/hr/payroll-runs',[],['Authorization'=>'Bearer '.$token])->assertForbidden()->assertJsonPath('error','sensitive_scope');
    }
}
