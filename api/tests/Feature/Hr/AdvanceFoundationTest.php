<?php
namespace Tests\Feature\Hr;
use App\Exceptions\BusinessException;
use App\Models\{BonusScheme,Expense,SalaryAdjustment,SalaryAdvance};
use App\Support\Tenancy;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
class AdvanceFoundationTest extends TestCase
{
    use RefreshDatabase;
    public function test_factories_are_scoped_and_snapshots_hidden(): void
    {
        $a=$this->makeInstitution('advance-found-a');$b=$this->makeInstitution('advance-found-b');
        foreach([$a,$b] as $i) Tenancy::as($i,function(){SalaryAdvance::factory()->create();SalaryAdjustment::factory()->create();});
        Tenancy::as($a,function()use($b){
            $this->assertSame(1,SalaryAdvance::count());$this->assertSame(1,SalaryAdjustment::count());
            $this->assertArrayNotHasKey('terms_snapshot',SalaryAdvance::first()->toArray());
            $this->assertArrayNotHasKey('application_snapshot',BonusScheme::factory()->create()->toArray());
            $this->expectException(\LogicException::class);SalaryAdvance::factory()->create(['institution_id'=>$b->id]);
        });
    }
    public function test_terms_snapshot_and_expense_unique_foreign_key_are_db_enforced(): void
    {
        Tenancy::as($this->makeInstitution('advance-db'),function(){
            foreach([['terms_snapshot'=>null],['expense_id'=>999999]] as $invalid){
                try{SalaryAdvance::factory()->create($invalid);$this->fail('Invalid link/snapshot accepted');}
                catch(QueryException $e){$this->assertSame('23000',$e->errorInfo[0]);}
            }
            $expense=Expense::factory()->create(['source'=>'advance']);SalaryAdvance::factory()->create(['expense_id'=>$expense->id]);
            try{SalaryAdvance::factory()->create(['expense_id'=>$expense->id]);$this->fail('Duplicate expense accepted');}
            catch(QueryException $e){$this->assertSame('23000',$e->errorInfo[0]);}
            SalaryAdvance::factory()->count(2)->create();$this->assertSame(3,SalaryAdvance::count());
        });
    }
    public function test_reviewed_financial_fields_and_deletion_are_rejected(): void
    {
        Tenancy::as($this->makeInstitution('advance-immutable'),function(){
            foreach([SalaryAdvance::factory()->create(),SalaryAdjustment::factory()->create()] as $row){
                foreach([fn()=>$row->update(['amount'=>'999.00']),fn()=>$row->delete()] as $operation){
                    try{$operation();$this->fail('Financial history changed');}catch(BusinessException $e){$this->assertSame('salary_immutable',$e->errorCode);}
                    $row->refresh();
                }
                $this->assertSame('100.00',$row->amount);
            }
            $row=SalaryAdvance::first();
            try{$row->update(['terms_snapshot'=>['changed'=>true]]);$this->fail('Reviewed terms changed');}
            catch(BusinessException $e){$this->assertSame('salary_immutable',$e->errorCode);}
            $row->refresh();$skip=['month'=>'2026-10','reason'=>'Fixture','approved_by'=>1,'at'=>'2026-10-15'];
            $row->update(['skipped_months'=>[$skip]]);$this->assertSame(self::keySorted([$skip]),self::keySorted($row->fresh()->skipped_months));
            try{$row->update(['skipped_months'=>[]]);$this->fail('Skip evidence erased');}
            catch(BusinessException $e){$this->assertSame(self::keySorted([$skip]),self::keySorted($row->fresh()->skipped_months));}
        });
    }
    public function test_bonus_application_snapshot_and_final_state_are_immutable(): void
    {
        Tenancy::as($this->makeInstitution('bonus-immutable'),function(){
            $row=BonusScheme::factory()->create();$snapshot=['rows'=>[['type'=>'staff','id'=>1,'amount'=>'100.00']]];
            $row->update(['status'=>'applied','application_snapshot'=>$snapshot]);
            foreach([fn()=>$row->update(['application_snapshot'=>[]]),fn()=>$row->delete()] as $operation){
                try{$operation();$this->fail('Bonus history changed');}catch(BusinessException $e){$this->assertSame('salary_immutable',$e->errorCode);}
                $row->refresh();
            }
            $this->assertSame(self::keySorted($snapshot),self::keySorted($row->application_snapshot));
        });
    }

    /** MySQL JSON columns return object keys in their own order; compare values and types, not key order */
    private static function keySorted(mixed $value): mixed
    {
        if(!is_array($value))return $value;
        if(!array_is_list($value))ksort($value);
        return array_map(fn($item)=>self::keySorted($item),$value);
    }
}
