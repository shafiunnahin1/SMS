<?php
namespace Tests\Feature\Hr;
use App\Models\SalaryAdjustment;

// staff-payroll.md §7.1, D86/D104: a bonus run carries only approved bonus adjustments (no salary, no attendance deduction);
// the regular run of the same month leaves them out, so a bonus is never paid twice.
class PayrollBonusRunTest extends PayrollRunTestCase
{
    public function test_bonus_adjustments_go_only_to_the_separate_bonus_run(): void
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();
        $bonus=SalaryAdjustment::factory()->create(['payee_id'=>$staff->id,'kind'=>'bonus','amount'=>'20000.00','description'=>'Eid','status'=>'approved','approved_by'=>$admin->id]);
        $regular=$this->draft($accountant);
        $this->assertSame([],array_values(array_filter($regular->items->first()->breakdown,fn($l)=>$l['source']==='adjustment')),'no bonus in the regular run');
        $eid=$this->draft($accountant,'2026-10',['kind'=>'bonus','label'=>'eid']);
        $item=$eid->items->first();
        $this->assertSame(['20000.00','20000.00','0.00'],[$item->net,$item->total_earnings,$item->total_deductions]);
        $this->assertSame([['adjustment',$bonus->id]],array_map(fn($l)=>[$l['source'],$l['ref_id']],$item->breakdown));
        $this->runs()->transition($accountant,$eid->id,'review');
        $this->assertSame('PS-2026-10-0001',$this->runs()->transition($admin,$eid->id,'approve')->items->first()->slip_no);
    }
}
