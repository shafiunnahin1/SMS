<?php
namespace Tests\Feature\Hr;
use App\Models\{AuditLog,Expense,SalaryAdvance};
use App\Services\Hr\{SalaryAdvanceService,SalaryAdjustmentService};
use App\Services\CashBookService;
use App\Exceptions\BusinessException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Validation\ValidationException;
class AdvanceLifecycleTest extends RevisionTestCase
{
    private function prepare(): array
    {
        [$i,$admin,$staff]=$this->setupHr();$revision=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$revision->id,'approve');
        return [$i,$admin,$staff,app(SalaryAdvanceService::class)];
    }
    private function request($s,$admin,$staff,array $more=[]){return $s->store($admin,array_replace(['payee_type'=>'staff','payee_id'=>$staff->id,'amount'=>'10000.00','installments'=>3,'recover_from_month'=>'2026-10','reason'=>'Fixture'],$more));}
    public function test_disbursement_is_one_expense_and_one_cash_outflow_and_retry_is_idempotent(): void
    {
        [$i,$admin,$staff,$s]=$this->prepare();$row=$this->request($s,$admin,$staff);$s->transition($admin,$row->id,'approve');
        $row=$s->transition($admin,$row->id,'disburse',['date'=>'2026-10-15','payment_method'=>'cash']);$before=AuditLog::count();
        $again=$s->transition($admin,$row->id,'disburse',['date'=>'2026-10-15','payment_method'=>'cash']);
        $this->assertSame($row->expense_id,$again->expense_id);$this->assertSame('active',$again->status);$this->assertSame($before,AuditLog::count());
        $expense=Expense::findOrFail($row->expense_id);$this->assertSame('advance',$expense->source);$this->assertSame('10000.00',$expense->amount);$this->assertSame(1,Expense::count());
        $book=app(CashBookService::class)->show('2026-10-15','20000.00');$this->assertSame('10000.00',$book['cash_out']);
        $saved=$row->fresh()->getAttributes();$this->assertSame('3333.33',$s->recovery($admin,$row->id,'2026-10','28000.00')['recovery']);$this->assertSame('10000.00',$s->recovery($admin,$row->id,'2026-12','28000.00')['recovery']);$this->assertSame($saved,$row->fresh()->getAttributes());
        try{$s->transition($admin,$row->id,'disburse',['date'=>'2026-10-15','payment_method'=>'bank']);$this->fail('Conflicting retry accepted');}catch(BusinessException $e){$this->assertSame('advance_conflict',$e->errorCode);}
    }
    public function test_skip_and_write_off_are_retained_and_do_not_rewrite_financial_history(): void
    {
        [$i,$admin,$staff,$s]=$this->prepare();$row=$this->request($s,$admin,$staff);$s->transition($admin,$row->id,'approve');$s->transition($admin,$row->id,'disburse',['date'=>'2026-10-15','payment_method'=>'bank']);
        $s->transition($admin,$row->id,'skip-installment',['month'=>'2026-10','reason'=>'Requested']);$s->transition($admin,$row->id,'skip-installment',['month'=>'2026-10','reason'=>'Requested']);
        $this->assertCount(1,$row->fresh()->skipped_months);$this->assertSame('0.00',$s->recovery($admin,$row->id,'2026-10','28000.00')['recovery']);
        $s->transition($admin,$row->id,'write-off',['reason'=>'Approved waiver']);$s->transition($admin,$row->id,'write-off',['reason'=>'Approved waiver']);
        $this->assertSame('written_off',$row->fresh()->status);$this->assertSame('0.00',$row->fresh()->recovered);$this->assertSame(1,Expense::count());
        $audit=AuditLog::where('action','salary.advance.written_off')->firstOrFail();$this->assertSame('Approved waiver',$audit->new_data['reason']);$this->assertSame(1,AuditLog::where('action','salary.advance.written_off')->count());
        $this->assertSame('0.00',app(CashBookService::class)->show('2026-10-15','20000.00')['cash_out']);
    }
    public function test_stale_policy_rejects_approval_without_effects(): void
    {
        [$i,$admin,$staff,$s]=$this->prepare();$row=$this->request($s,$admin,$staff);$i->update(['settings'=>['payroll'=>['max_advance_months'=>2]]]);
        try{$s->transition($admin,$row->id,'approve');$this->fail('Stale approval succeeded');}catch(BusinessException $e){$this->assertSame('stale_advance',$e->errorCode);}
        $this->assertSame('requested',$row->fresh()->status);$this->assertSame(0,Expense::count());
    }
    public function test_closed_cash_day_rolls_back_expense_link_and_status(): void
    {
        [$i,$admin,$staff,$s]=$this->prepare();$row=$this->request($s,$admin,$staff);$s->transition($admin,$row->id,'approve');
        $this->api('POST',$this->hostOf($i),'cashbook/2026-10-15/close',$admin,['opening_cash'=>'20000.00','counted_cash'=>'20000.00'])->assertCreated();$this->bindTenant($i);
        try{$s->transition($admin,$row->id,'disburse',['date'=>'2026-10-15','payment_method'=>'cash']);$this->fail('Closed day disbursement succeeded');}catch(BusinessException $e){$this->assertSame(409,$e->status);}
        $this->assertSame('approved',$row->fresh()->status);$this->assertNull($row->fresh()->expense_id);$this->assertSame(0,Expense::count());
    }
    public function test_active_limit_and_accountant_approval_are_rejected(): void
    {
        [$i,$admin,$staff,$s]=$this->prepare();$row=$this->request($s,$admin,$staff);$accountant=$this->makeUser($i,'accountant');
        try{$s->transition($accountant,$row->id,'approve');$this->fail('Accountant approved');}catch(AuthorizationException){$this->assertSame('requested',$row->fresh()->status);}
        $s->transition($admin,$row->id,'approve');$s->transition($accountant,$row->id,'disburse',['date'=>'2026-10-15','payment_method'=>'bank']);
        $this->expectException(ValidationException::class);$this->request($s,$admin,$staff);
    }
    public function test_adjustment_direction_reason_and_immutable_approval(): void
    {
        [$i,$admin,$staff]=$this->prepare();$s=app(SalaryAdjustmentService::class);
        $input=['payee_type'=>'staff','payee_id'=>$staff->id,'kind'=>'fine','direction'=>'deduction','amount'=>'100.00','month'=>'2026-10','description'=>'Fixture'];
        foreach([['direction'=>'earning'],['description'=>''],['amount'=>'-1.00'],['scheme_id'=>1]] as $bad){
            try{$s->store($admin,array_replace($input,$bad));$this->fail('Invalid adjustment accepted');}catch(ValidationException){$this->assertTrue(true);}
        }
        $row=$s->store($admin,$input);$s->transition($admin,$row->id,'approve');$s->transition($admin,$row->id,'approve');$this->assertSame('approved',$row->fresh()->status);
        try{$row->fresh()->update(['month'=>'2026-11']);$this->fail('Approved month changed');}catch(BusinessException $e){$this->assertSame('salary_immutable',$e->errorCode);}
        $s->transition($admin,$row->id,'cancel');$this->assertSame('cancelled',$row->fresh()->status);
    }
}
