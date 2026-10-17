<?php
namespace Tests\Feature\Hr;
use App\Exceptions\BusinessException;
use App\Models\{PayrollItem,PayrollRun};

// staff-payroll.md §7.1/§17, D32/D104: an approved run is frozen - no recompute (422), no amount/breakdown edit, no delete;
// a correction is a later adjustment or supplementary run, never an edit.
class PayrollImmutabilityTest extends PayrollRunTestCase
{
    private function approved(): array
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();
        $run=$this->draft($accountant);$this->runs()->transition($accountant,$run->id,'review');
        return [$this->runs()->transition($admin,$run->id,'approve'),$admin,$accountant];
    }

    public function test_draft_recompute_is_idempotent_but_an_approved_run_refuses_it_with_422(): void
    {
        [$i,$admin,$staff,$accountant]=$this->payroll();
        $run=$this->draft($accountant);$first=$run->items->first()->only(['payee_id','gross','net','breakdown']);
        $again=$this->runs()->transition($accountant,$run->id,'recompute');
        $this->assertSame($first,$again->items->first()->only(['payee_id','gross','net','breakdown']));
        $this->assertSame(1,PayrollItem::where('run_id',$run->id)->count(),'recompute replaces, never duplicates');

        $this->runs()->transition($accountant,$run->id,'review');$this->runs()->transition($admin,$run->id,'approve');
        try {$this->runs()->transition($accountant,$run->id,'recompute');$this->fail('recompute after approval');}
        catch(BusinessException $e){$this->assertSame([422,'payroll_frozen'],[$e->status,$e->errorCode]);}
    }

    public function test_approved_items_and_runs_cannot_be_edited_or_deleted(): void
    {
        [$run]=$this->approved();$item=$run->items->first();$net=$item->net;
        foreach([fn()=>$item->update(['net'=>'1.00']),fn()=>$item->update(['breakdown'=>[]]),fn()=>$item->delete(),
                 fn()=>$run->update(['total_net'=>'1.00']),fn()=>$run->delete()] as $attempt){
            try {$attempt();$this->fail('frozen payroll changed');}
            catch(BusinessException $e){$this->assertSame('salary_immutable',$e->errorCode);}
            $item->refresh();$run->refresh();
        }
        $this->assertSame([$net,'approved'],[$item->net,$run->status]);
        $item->update(['status'=>'held','hold_reason'=>'bank check']);   // payment fields still move
        $this->assertSame('held',$item->fresh()->status);
    }

    public function test_a_second_regular_run_for_the_same_month_needs_its_own_label(): void
    {
        [,,$accountant]=$this->approved();
        try {$this->draft($accountant);$this->fail('duplicate run');}
        catch(BusinessException $e){$this->assertSame(409,$e->status);}
        $this->assertSame('draft',$this->draft($accountant,'2026-10',['label'=>'correction'])->status);
    }
}
