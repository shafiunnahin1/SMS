<?php
namespace Tests\Feature\Hr;
use App\Models\{ProvidentFundEntry,SalaryAdjustment,SalaryAdvance,SalaryPayAccount,SalaryStructure,StaffAttendance};
use App\Services\Hr\{PayrollPaymentService,PayrollRunService};
use App\Support\Money;
use Illuminate\Validation\ValidationException;

// staff-payroll.md §11/§17: leaving-month prorated salary + approved unpaid adjustments - whole advance remainder + PF balance paid out;
// after approval the payee is inactive and the structure is closed; gratuity / leave encashment stay manual adjustments.
class FinalSettlementTest extends PayrollRunTestCase
{
    public function test_final_settlement_combines_salary_adjustments_advance_and_pf_then_closes_the_payee(): void
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();   // 28,000 from 1 Oct
        SalaryPayAccount::factory()->create(['payee_id'=>$staff->id]);
        foreach(app(\App\Services\Hr\HrCalendar::class)->dates('2026-10-01','2026-10-10') as $date) StaffAttendance::create(['staff_id'=>$staff->id,'date'=>$date,'status'=>'present']);
        $staff->forceFill(['leaving_date'=>'2026-10-10'])->save();
        $advance=SalaryAdvance::factory()->create(['payee_id'=>$staff->id,'status'=>'active','amount'=>'5000.00','installment_amount'=>'1000.00','installments'=>5,'requested_by'=>$accountant->id]);
        $old=SalaryAdjustment::factory()->create(['payee_id'=>$staff->id,'month'=>'2026-09','kind'=>'arrear','amount'=>'500.00','status'=>'approved','approved_by'=>$admin->id]);
        ProvidentFundEntry::factory()->create(['payee_id'=>$staff->id,'kind'=>'employee','amount'=>'1000.00','month'=>'2026-09']);
        ProvidentFundEntry::factory()->create(['payee_id'=>$staff->id,'kind'=>'employer','amount'=>'500.00','month'=>'2026-09']);

        $host=$this->hostOf($i);
        $id=$this->api('POST',$host,"hr/final-settlement/staff/{$staff->id}/start",$accountant)->assertCreated()->assertJsonPath('data.kind','final')->json('data.id');
        $this->api('POST',$host,"hr/final-settlement/staff/{$staff->id}/start",$accountant)->assertCreated()->assertJsonPath('data.id',$id);   // identical retry
        $this->bindTenant($i);
        $run=app(PayrollRunService::class)->transition($accountant,$id,'review');
        $item=$run->items->sole();$lines=collect($item->breakdown);
        $this->assertSame('9032.26',$item->gross,'28,000 x 10/31');
        $this->assertSame('5000.00',$lines->firstWhere('source','advance')['amount'],'the whole remainder, not one installment');
        $this->assertSame('1500.00',$lines->firstWhere('source','pf_withdrawal')['amount']);
        $this->assertSame($old->id,$lines->firstWhere('source','adjustment')['ref_id'],'an older approved adjustment is settled here');
        $this->assertSame(Money::format(903226+50000+150000-500000),$item->net);

        $this->assertSame(0,$this->draft($accountant)->items->where('payee_id',$staff->id)->where('payee_type','staff')->count(),'not paid twice in the regular run');
        app(PayrollRunService::class)->transition($admin,$id,'approve');
        $this->assertSame(['inactive','2026-10-10'],[$staff->fresh()->status,SalaryStructure::where('payee_type','staff')->where('payee_id',$staff->id)->value('effective_to')->toDateString()]);

        app(PayrollPaymentService::class)->pay($accountant,$id,[]);
        $this->assertSame(['5000.00','closed'],[$advance->fresh()->recovered,$advance->fresh()->status]);
        $this->assertSame('0.00',Money::format(Money::toPaisa((string)ProvidentFundEntry::where('payee_id',$staff->id)->sum('amount'))),'PF balance withdrawn');
        $this->assertSame('applied',$old->fresh()->status);
    }

    public function test_start_needs_a_leaving_date(): void
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();
        $this->expectException(ValidationException::class);
        app(PayrollRunService::class)->startFinal($accountant,'staff',$staff->id);
    }
}
