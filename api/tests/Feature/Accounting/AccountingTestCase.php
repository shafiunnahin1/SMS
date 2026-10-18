<?php
namespace Tests\Feature\Accounting;
use App\Models\{Institution,User};
use App\Services\Accounting\AccountingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

abstract class AccountingTestCase extends TestCase
{
    use RefreshDatabase;
    protected Institution $i; protected User $admin;
    protected function setUp(): void
    {
        parent::setUp(); $this->travelTo('2026-10-15 12:00:00'); Queue::fake();
        $this->i=$this->makeInstitution('acct');$this->admin=$this->makeUser($this->i,'admin');
        $this->settings(['start_date'=>'2026-10-01']);
    }
    protected function settings(array $accounting): void
    {
        $this->i->forceFill(['settings'=>array_replace_recursive($this->i->fresh()->settings??[],['accounting'=>$accounting])])->save();
        $this->bindTenant($this->i->fresh());
    }
    protected function acc(): AccountingService { return app(AccountingService::class); }
    protected function journal(array $lines, string $date='2026-10-15', bool $post=true)
    {
        return $this->acc()->create(['type'=>'journal','date'=>$date,'narration'=>'fixture'],$lines,$this->admin,$post);
    }
}
