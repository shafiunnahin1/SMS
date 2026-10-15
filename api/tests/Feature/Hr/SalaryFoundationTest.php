<?php
namespace Tests\Feature\Hr;

use App\Exceptions\BusinessException;
use App\Models\{BonusScheme,SalaryComponent,SalaryPayAccount,SalaryRevision,SalaryStructure,SalaryStructureLine,Teacher};
use App\Support\Tenancy;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SalaryFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_factories_are_tenant_bound_and_account_storage_is_encrypted_and_hidden(): void
    {
        $a=$this->makeInstitution('salary-found-a');$b=$this->makeInstitution('salary-found-b');
        foreach([$a,$b] as $i) Tenancy::as($i,function(){
            SalaryStructureLine::factory()->create();
            SalaryRevision::factory()->create();
            BonusScheme::factory()->create();
            SalaryPayAccount::factory()->create();
        });
        Tenancy::as($a,function(){
            foreach([SalaryStructureLine::class,SalaryStructure::class,SalaryComponent::class,SalaryRevision::class,BonusScheme::class,SalaryPayAccount::class] as $class) {
                $this->assertSame(1,$class::count());
            }
            $row=SalaryPayAccount::first()->fresh();
            $this->assertSame('0000000000000042',$row->account_number);
            $this->assertNotSame($row->account_number,$row->getRawOriginal('account_number'));
            $this->assertStringNotContainsString('0000000000000042',$row->getRawOriginal('account_number'));
            $this->assertArrayNotHasKey('account_number',$row->toArray());
            $this->assertStringNotContainsString('0000000000000042',$row->toJson());
            $this->assertSame('****0042',$row->maskedNumber());
            $this->assertArrayNotHasKey('calculation_snapshot',SalaryRevision::first()->toArray());
        });
    }

    public function test_business_codes_are_unique_within_tenant_but_not_across_tenants(): void
    {
        $a=$this->makeInstitution('salary-code-a');$b=$this->makeInstitution('salary-code-b');
        foreach([$a,$b] as $i) Tenancy::as($i,fn()=>SalaryComponent::factory()->create(['code'=>'SHARED']));
        Tenancy::as($a,function(){
            $this->expectException(QueryException::class);
            SalaryComponent::factory()->create(['code'=>'SHARED']);
        });
    }

    public function test_duplicate_pay_account_and_duplicate_structure_start_are_db_rejected(): void
    {
        $a=$this->makeInstitution('salary-unique');
        Tenancy::as($a,function(){
            $account=SalaryPayAccount::factory()->create();
            try { SalaryPayAccount::factory()->create(['payee_id'=>$account->payee_id]);$this->fail('Duplicate account accepted'); }
            catch(QueryException $e){$this->assertSame('23000',$e->errorInfo[0]);}
            $structure=SalaryStructure::factory()->create();
            $this->expectException(QueryException::class);
            SalaryStructure::factory()->create(['payee_id'=>$structure->payee_id]);
        });
    }

    public function test_required_snapshot_and_revision_letter_uniqueness_are_db_enforced(): void
    {
        Tenancy::as($this->makeInstitution('salary-snapshot'),function(){
            try { SalaryRevision::factory()->create(['calculation_snapshot'=>null]);$this->fail('Null snapshot accepted'); }
            catch(QueryException $e){$this->assertSame('23000',$e->errorInfo[0]);}
            SalaryRevision::factory()->create(['letter_no'=>'REV-2026-1']);
            $this->expectException(QueryException::class);
            SalaryRevision::factory()->create(['letter_no'=>'REV-2026-1']);
        });
    }

    public function test_saved_financial_history_and_reviewed_snapshot_reject_model_mutations(): void
    {
        Tenancy::as($this->makeInstitution('salary-immutable'),function(){
            $line=SalaryStructureLine::factory()->create();
            $structure=SalaryStructure::findOrFail($line->structure_id);
            $revision=SalaryRevision::factory()->create();
            foreach([[$line,'value','999.00'],[$structure,'basic','999.00'],[$revision,'calculation_snapshot',['changed'=>true]]] as [$row,$field,$value]){
                try {$row->update([$field=>$value]);$this->fail('History mutation accepted');}
                catch(BusinessException $e){$this->assertSame('salary_immutable',$e->errorCode);}
                $row->refresh();
                try {$row->delete();$this->fail('History deletion accepted');}
                catch(BusinessException $e){$this->assertSame(409,$e->status);}
            }
            $revision->update(['status'=>'applied']);
            try {$revision->update(['status'=>'cancelled']);$this->fail('Applied revision mutated');}
            catch(BusinessException $e){$this->assertSame('applied',$revision->fresh()->status);}
            $this->assertSame('100.00',$line->fresh()->value);
            $this->assertSame('10000.00',$structure->fresh()->basic);
        });
    }

    public function test_system_and_referenced_components_are_protected_but_can_deactivate(): void
    {
        Tenancy::as($this->makeInstitution('salary-component'),function(){
            $line=SalaryStructureLine::factory()->create();$component=SalaryComponent::findOrFail($line->component_id);
            foreach([fn()=>$component->update(['type'=>'deduction']),fn()=>$component->delete()] as $operation){
                try {$operation();$this->fail('Referenced component changed');}
                catch(BusinessException $e){$this->assertSame('salary_immutable',$e->errorCode);}
                $component->refresh();
            }
            $component->update(['is_active'=>false]);
            $this->assertFalse($component->fresh()->is_active);
            $system=SalaryComponent::factory()->create(['is_system'=>true]);
            $this->expectException(BusinessException::class);$system->delete();
        });
    }

    public function test_no_staff_cache_or_later_settlement_tables_and_teacher_cache_is_not_mass_assignable(): void
    {
        foreach(['salary','house_rent','medical_allowance','transport_allowance'] as $field) {
            $this->assertNotContains($field,(new Teacher())->getFillable());
            $this->assertFalse(Schema::hasColumn('staff_members',$field));
        }
        $this->assertTrue(Schema::hasTable('salary_adjustments')); // D87: positive R3.6 schema coverage
        foreach(['payroll_runs','payroll_items'] as $table) $this->assertFalse(Schema::hasTable($table));
        $a=$this->makeInstitution('salary-write-a');$b=$this->makeInstitution('salary-write-b');
        Tenancy::as($a,function()use($b){
            $this->expectException(\LogicException::class);
            SalaryComponent::factory()->create(['institution_id'=>$b->id]);
        });
    }
}
