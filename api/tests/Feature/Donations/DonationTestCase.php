<?php
namespace Tests\Feature\Donations;
use App\Models\{DonationFund,Institution,User};
use App\Services\Donations\DonationService;
use App\Services\ExpenseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

abstract class DonationTestCase extends TestCase
{
    use RefreshDatabase;
    protected Institution $i; protected User $admin;
    protected function setUp(): void
    {
        parent::setUp(); $this->travelTo('2026-10-15 12:00:00'); Queue::fake();
        $this->i=$this->makeInstitution('madrasa');$this->admin=$this->makeUser($this->i,'admin');
        $this->i->forceFill(['settings'=>array_replace($this->i->settings??[],['opt_in_modules'=>['donations']])])->save();
        $this->bindTenant($this->i->fresh()); $this->actingAs($this->admin);   // expense audit rows record the acting user
    }
    protected function svc(): DonationService { return app(DonationService::class); }
    protected function fund(bool $restricted=true,string $name='Construction'): DonationFund { return DonationFund::create(['name'=>$name,'kind'=>'project','restricted'=>$restricted]); }
    protected function give(DonationFund $f,string $amount,array $extra=[]) { return $this->svc()->record($this->admin,['fund_id'=>$f->id,'amount'=>$amount]+$extra); }
    protected function spend(DonationFund $f,string $amount)
    {
        return app(ExpenseService::class)->create(['category'=>'construction','title'=>'Bricks','amount'=>$amount,'expense_date'=>'2026-10-15','payment_method'=>'cash','fund_id'=>$f->id],$this->admin->id);
    }
}
