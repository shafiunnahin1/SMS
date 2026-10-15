<?php
namespace Tests\Feature\Hr;
use App\Models\{AuditLog,BonusScheme,SalaryRevision,SalaryStructure};
use App\Services\Hr\{BonusSchemeService,SalaryCalendar};
use App\Exceptions\BusinessException;

class BonusSchemeTest extends RevisionTestCase
{
    public function test_service_months_proration_minimum_cap_and_exclusions_match_reference(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$staff->update(['joining_date'=>'2026-02-01','designation'=>'Assistant']);
        $first=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$first->id,'approve');
        $service=app(BonusSchemeService::class);
        $scheme=$service->save($admin,['name'=>'Festival','pay_month'=>'2026-10','basis'=>'basic','value'=>'100.00','prorate_below_months'=>12]);
        $row=$service->preview($admin,$scheme->id)[0];$this->assertSame(8,$row['service_months']);$this->assertSame('13333.33',$row['amount']);
        $staff->update(['joining_date'=>'2025-08-01']);
        $service->save($admin,['max_amount'=>'15000.00'],$scheme->id);
        $this->assertSame('15000.00',$service->preview($admin,$scheme->id)[0]['amount']);
        $staff->update(['joining_date'=>'2026-08-01']);
        $service->save($admin,['min_service_months'=>3],$scheme->id);
        $this->assertSame('0.00',$service->preview($admin,$scheme->id)[0]['amount']);
        $service->save($admin,['min_service_months'=>0,'applies_to'=>['exclude'=>[['type'=>'staff','id'=>$staff->id]]]],$scheme->id);
        $this->assertSame('excluded',$service->preview($admin,$scheme->id)[0]['excluded_reason']);
        $this->assertSame(1,app(SalaryCalendar::class)->serviceMonths('2026-01-31','2026-02-28'));
    }
    public function test_fixed_preview_and_apply_retries_fail_closed_without_financial_or_state_effects(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$staff->update(['joining_date'=>'2020-01-01']);
        $service=app(BonusSchemeService::class);$scheme=$service->save($admin,['name'=>'Fixed','pay_month'=>'2026-10','basis'=>'fixed','value'=>'500.01']);
        $this->assertSame('500.01',$service->preview($admin,$scheme->id)[0]['amount']);
        $before=[$scheme->fresh()->getAttributes(),SalaryStructure::count(),SalaryRevision::count(),AuditLog::count()];
        for($n=0;$n<2;$n++){
            try{$service->apply($admin,$scheme->id);$this->fail('Deferred apply succeeded');}
            catch(BusinessException $e){$this->assertSame('dependency_pending',$e->errorCode);}
        }
        $this->assertSame($before,[$scheme->fresh()->getAttributes(),SalaryStructure::count(),SalaryRevision::count(),AuditLog::count()]);
        $service->end($admin,$scheme->id);$service->end($admin,$scheme->id);
        $this->assertSame('cancelled',$scheme->fresh()->status);
        $this->expectException(BusinessException::class);$service->save($admin,['name'=>'Changed'],$scheme->id);
    }
    public function test_percentage_and_service_proration_round_only_once_like_decimal_reference(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$staff->update(['joining_date'=>'2026-09-01']);
        SalaryStructure::factory()->create(['payee_id'=>$staff->id,'basic'=>'0.01','gross'=>'0.01']);
        $service=app(BonusSchemeService::class);
        $scheme=$service->save($admin,['name'=>'Paisa boundary','pay_month'=>'2026-10','basis'=>'basic','value'=>'50.00','prorate_below_months'=>2]);
        $this->assertSame('0.00',$service->preview($admin,$scheme->id)[0]['amount']);
        $service->save($admin,['prorate_below_months'=>0],$scheme->id);
        $this->assertSame('0.01',$service->preview($admin,$scheme->id)[0]['amount']);
    }

}
