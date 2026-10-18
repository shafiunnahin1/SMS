<?php
namespace Tests\Feature\Hr;
use App\Models\{AuditLog,BonusScheme,SalaryAdjustment,SalaryRevision,SalaryStructure};
use App\Services\Hr\{BonusSchemeService,SalaryCalendar};
use App\Exceptions\BusinessException;
use Illuminate\Auth\Access\AuthorizationException;

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
    public function test_fixed_bonus_application_is_atomic_and_retry_returns_original_effects(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$staff->update(['joining_date'=>'2020-01-01']);$accountant=$this->makeUser($i,'accountant');
        $service=app(BonusSchemeService::class);$scheme=$service->save($accountant,['name'=>'Fixed','pay_month'=>'2026-10','basis'=>'fixed','value'=>'500.01']);
        $this->assertSame('500.01',$service->preview($admin,$scheme->id)[0]['amount']);
        $before=[SalaryStructure::count(),SalaryRevision::count(),SalaryAdjustment::count(),AuditLog::count()];
        try{$service->apply($accountant,$scheme->id);$this->fail('Accountant applied a bonus scheme');}catch(AuthorizationException){$this->assertSame('draft',$scheme->fresh()->status);}
        $this->assertSame($before,[SalaryStructure::count(),SalaryRevision::count(),SalaryAdjustment::count(),AuditLog::count()]);
        $first=$service->apply($admin,$scheme->id);$again=$service->apply($admin,$scheme->id);
        $this->assertCount(1,$first);$this->assertSame($first->modelKeys(),$again->modelKeys());
        $this->assertSame('500.01',$first->first()->amount);$this->assertSame('approved',$first->first()->status);$this->assertSame($scheme->id,$first->first()->scheme_id);
        $this->assertSame('applied',$scheme->fresh()->status);$this->assertNotEmpty($scheme->fresh()->application_snapshot['scheme_fingerprint']);
        $this->assertNotEmpty($scheme->fresh()->application_snapshot['lines'][0]['source_fingerprint']);
        $this->assertSame(1,SalaryAdjustment::where('scheme_id',$scheme->id)->count());
        try{$service->end($admin,$scheme->id);$this->fail('Applied scheme cancelled');}catch(BusinessException $e){$this->assertSame('dependency_pending',$e->errorCode);}
        $this->expectException(BusinessException::class);$service->save($admin,['name'=>'Changed'],$scheme->id);
    }
    public function test_bonus_application_rolls_back_earlier_effects_when_a_later_payee_conflicts(): void
    {
        [$i,$admin,$staff]=$this->setupHr();$staff->update(['joining_date'=>'2020-01-01']);
        [, $teacher]=$this->teacher($i);$teacher->update(['joining_date'=>'2020-01-01']);
        $service=app(BonusSchemeService::class);$scheme=$service->save($admin,['name'=>'Atomic failure','pay_month'=>'2026-10','basis'=>'fixed','value'=>'500.00']);
        \App\Support\Tenancy::as($i,fn()=>SalaryAdjustment::create(['payee_type'=>'staff','payee_id'=>$staff->id,'kind'=>'bonus','direction'=>'earning','amount'=>'500.00',
            'month'=>'2026-10','scheme_id'=>$scheme->id,'description'=>'Existing effect','status'=>'approved','created_by'=>$admin->id,'approved_by'=>$admin->id]));
        try{$service->apply($admin,$scheme->id);$this->fail('Partial bonus application succeeded');}
        catch(\Illuminate\Database\QueryException){$this->assertSame('draft',$scheme->fresh()->status);}
        $this->assertNull($scheme->fresh()->application_snapshot);
        \App\Support\Tenancy::as($i,fn()=>$this->assertSame(1,SalaryAdjustment::where('scheme_id',$scheme->id)->count()));
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
