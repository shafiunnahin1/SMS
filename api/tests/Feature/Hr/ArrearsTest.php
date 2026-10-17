<?php
namespace Tests\Feature\Hr;
use App\Exceptions\BusinessException;
use App\Models\{PayrollItem,SalaryAdjustment,SalaryPayAccount};
use App\Services\Hr\PayrollPaymentService;

// staff-payroll.md §3.3/§16 #8-#9, D86/D104: a backdated increment over months already paid becomes one approved arrear adjustment
// that the next run pays; without settled history for every ended month approval still fails closed; backdated decrement stays off.
class ArrearsTest extends PayrollRunTestCase
{
    /** basic 20,000 + house rent 40% = 28,000 from 1 July; August and September paid at that structure */
    private function paidHistory(): array
    {
        [$i,$admin,$staff]=$this->setupHr();$accountant=$this->makeUser($i,'accountant');
        $first=$this->initial($admin,'staff',$staff->id,['effective_from'=>'2026-07-01','arrears_policy'=>'none']);$this->revisionService()->transition($admin,$first->id,'approve');
        SalaryPayAccount::factory()->create(['payee_id'=>$staff->id]);
        foreach(['2026-08','2026-09'] as $month){
            $run=$this->draft($accountant,$month);$this->runs()->transition($accountant,$run->id,'review');$this->runs()->transition($admin,$run->id,'approve');
            app(PayrollPaymentService::class)->pay($accountant,$run->id,['date'=>'2026-10-15']);
        }
        return [$i,$admin,$staff,$accountant];
    }

    public function test_increment_from_1_august_pays_two_months_of_arrears_in_the_next_run(): void
    {
        [$i,$admin,$staff,$accountant]=$this->paidHistory();
        // 10% increment: 22,000 + 8,800 = 30,800 vs 28,000 -> 2,800 x 2 (fixture #8 shape)
        $raise=$this->increment($admin,'staff',$staff->id,['effective_from'=>'2026-08-01','arrears_policy'=>'auto']);
        $this->revisionService()->transition($admin,$raise->id,'approve');
        $arrear=SalaryAdjustment::where('revision_id',$raise->id)->sole();
        $this->assertSame(['arrear','earning','5600.00','2026-10','approved'],[$arrear->kind,$arrear->direction,$arrear->amount,$arrear->month,$arrear->status]);

        $october=$this->draft($accountant,'2026-10');
        $line=collect($october->items->first()->breakdown)->firstWhere('source','adjustment');
        $this->assertSame([$arrear->id,'5600.00'],[$line['ref_id'],$line['amount']]);
    }

    public function test_increment_from_16_august_prorates_the_first_month(): void
    {
        [$i,$admin,$staff]=$this->paidHistory();
        $raise=$this->increment($admin,'staff',$staff->id,['effective_from'=>'2026-08-16','arrears_policy'=>'auto']);
        $this->revisionService()->transition($admin,$raise->id,'approve');
        $this->assertSame('4245.16',SalaryAdjustment::where('revision_id',$raise->id)->sole()->amount,'2,800 x 16/31 + 2,800 (fixture #9)');
    }

    public function test_an_ended_month_without_settled_payroll_still_fails_closed(): void
    {
        [$i,$admin,$staff]=$this->paidHistory();
        $this->travelTo('2026-11-15 12:00:00');   // October has ended but was never paid
        $raise=$this->increment($admin,'staff',$staff->id,['effective_from'=>'2026-09-01','arrears_policy'=>'auto']);
        try {$this->revisionService()->transition($admin,$raise->id,'approve');$this->fail('arrears guessed for an unpaid month');}
        catch(BusinessException $e){$this->assertSame('dependency_pending',$e->errorCode);}
        $this->assertSame(['proposed',0],[$raise->fresh()->status,SalaryAdjustment::where('revision_id',$raise->id)->count()]);
    }

    public function test_backdated_decrement_is_refused_by_default(): void
    {
        [$i,$admin,$staff]=$this->paidHistory();
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->revisionService()->propose($admin,['payee_type'=>'staff','payee_id'=>$staff->id,'kind'=>'decrement','change_mode'=>'percent','change_value'=>'10.00',
            'effective_from'=>'2026-08-01','arrears_policy'=>'auto','reason'=>'correction']);
    }
}
