<?php
namespace Tests\Feature\Hr;
use Illuminate\Support\Facades\Route;

// R3.13 / D33: no platform person reaches salary data. Every salary, payslip, PF, advance, adjustment, revision, bonus and payroll
// route answers 403 to the Super Admin's token and to a support (impersonated) token on the tenant host - swept from the live routes.
class SalaryPlatformTenancyTest extends PayrollRunTestCase
{
    public function test_super_admin_and_impersonated_tokens_are_refused_on_every_salary_route(): void
    {
        config(['auth_policy.api_per_minute' => 100000]);
        [$i,$admin]=$this->payroll();$host=$this->hostOf($i);
        $super=$this->makeUser(null,'super_admin');
        $impersonated=$admin->createToken('support',['impersonated'])->plainTextToken;
        $sensitive='#^api/v1/(hr/(payroll|salary|pf|advances|adjustments|revisions|bonus|increment|final-settlement|reports|people/\{type\}/\{id\}/(salary|pay-accounts))|teacher/salary)#';
        $fill=['{id}'=>'1','{type}'=>'staff','{action}'=>'approve','{file}'=>'register.pdf','{name}'=>'register'];
        $seen=0;
        foreach(Route::getRoutes()->getRoutes() as $r){
            if(!preg_match($sensitive,$r->uri())) continue;
            foreach(array_diff($r->methods(),['HEAD']) as $method){
                $path=strtr(substr($r->uri(),strlen('api/v1/')),$fill);
                $this->api($method,$host,$path,$super)->assertForbidden();
                $this->app['auth']->forgetGuards();
                $res=$this->json($method,'http://'.$host.'/api/v1/'.$path,[],['Authorization'=>'Bearer '.$impersonated]);
                $this->assertSame(403,$res->status(),"$method $path as impersonated support: ".$res->getContent());
                $this->app['auth']->forgetGuards();
                $seen++;
            }
        }
        $this->assertGreaterThan(30,$seen,'the sweep found the salary routes');
    }
}
