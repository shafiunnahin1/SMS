<?php
namespace Tests\Feature\Hr;
use App\Models\SalaryComponent;
use App\Services\Hr\SalaryCalculator;
use Illuminate\Validation\ValidationException;

class SalaryCalculationTest extends LeaveTestCase
{
    public function test_reference_gross_and_separate_deduction_component_are_exact(): void
    {
        $this->setupHr();$lines=[];
        foreach([['house','percent_basic','40.00','earning'],['medical','fixed','1500.00','earning'],['transport','fixed','1000.00','earning'],['deduct','percent_basic','1.25','deduction']] as [$code,$mode,$value,$type]){
            $component=SalaryComponent::factory()->create(['code'=>$code,'calc'=>$mode,'type'=>$type]);
            $lines[]=['component_id'=>$component->id,'mode'=>$mode,'value'=>$value];
        }
        $result=app(SalaryCalculator::class)->calculate('20000.00',array_reverse($lines));
        $this->assertSame('30500.00',$result['gross']);
        $this->assertSame('250.00',$result['lines'][3]['amount']);
        $this->assertSame('20000.00',$result['basic']);
        $this->assertSame(array_column($lines,'component_id'),array_column($result['lines'],'component_id'));
        $this->assertSame('40.00',$result['lines'][0]['value']);
        $this->assertSame('8000.00',$result['lines'][0]['amount']);
    }

    public function test_half_paisa_rounds_half_up_without_float_and_excess_results_are_rejected(): void
    {
        $this->setupHr();$component=SalaryComponent::factory()->create(['calc'=>'percent_basic']);
        $result=app(SalaryCalculator::class)->calculate('0.01',[['component_id'=>$component->id,'value'=>'50.00']]);
        $this->assertSame('0.01',$result['lines'][0]['amount']);
        $this->assertSame('0.02',$result['gross']);
        $this->expectException(ValidationException::class);
        app(SalaryCalculator::class)->calculate('99999999.99',[['component_id'=>$component->id,'value'=>'99999999.99']]);
    }

    public function test_float_overprecision_negative_and_duplicate_inputs_are_rejected(): void
    {
        $this->setupHr();$calculator=app(SalaryCalculator::class);
        foreach([1.25,'1.001','-1.00','1e2','100000000.00'] as $bad){
            try{$calculator->calculate($bad,[]);$this->fail('Invalid money accepted');}
            catch(ValidationException $e){$this->assertArrayHasKey('basic',$e->errors());}
        }
        $component=SalaryComponent::factory()->create();
        $line=['component_id'=>$component->id,'value'=>'1.00'];
        $this->expectException(ValidationException::class);$calculator->calculate('100.00',[$line,$line]);
    }

    public function test_foreign_tenant_and_inactive_components_are_not_usable(): void
    {
        [$i]=$this->setupHr();$b=$this->makeInstitution('salary-calc-other');
        $foreign=$this->asTenant($b,fn()=>SalaryComponent::factory()->create());
        try {app(SalaryCalculator::class)->calculate('100.00',[['component_id'=>$foreign->id,'value'=>'1.00']]);$this->fail('Foreign component resolved');}
        catch(\Illuminate\Database\Eloquent\ModelNotFoundException $e){$this->assertSame(SalaryComponent::class,$e->getModel());}
        $inactive=SalaryComponent::factory()->create(['is_active'=>false]);
        $this->expectException(ValidationException::class);app(SalaryCalculator::class)->calculate('100.00',[['component_id'=>$inactive->id,'value'=>'1.00']]);
    }
}
