<?php
namespace Tests\Feature\Hr;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog,SalaryStructure,SalaryStructureLine};
use App\Services\Hr\SalaryStructureService;

class SalaryStructureTest extends RevisionTestCase
{
    public function test_apply_preserves_lines_closes_only_old_period_and_updates_current_teacher_cache_once(): void
    {
        [$i,$admin]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);
        $initial=$this->initial($admin,'teacher',$profile->id);
        $this->revisionService()->transition($admin,$initial->id,'approve');
        $old=SalaryStructure::first();$oldLines=SalaryStructureLine::get()->toArray();
        $this->assertSame('20000.00',$profile->fresh()->salary);
        $this->assertSame('8000.00',$profile->fresh()->house_rent);
        $next=$this->increment($admin,'teacher',$profile->id);
        $applied=$this->revisionService()->transition($admin,$next->id,'approve');
        $this->assertSame('applied',$applied->status);
        $this->assertSame('2026-10-14',$old->fresh()->effective_to->toDateString());
        $this->assertSame('20000.00',$old->fresh()->basic);
        $this->assertSame($oldLines,SalaryStructureLine::where('structure_id',$old->id)->get()->toArray());
        $this->assertSame('22000.00',$profile->fresh()->salary);
        $this->assertSame('8800.00',$profile->fresh()->house_rent);
        $retry=app(SalaryStructureService::class)->apply($next->id,$admin);
        $this->assertSame($next->id,$retry->revision_id);
        $this->assertSame(2,SalaryStructure::count());
        $this->assertSame(2,AuditLog::where('action','salary.revision.applied')->count());
        $this->assertSame(2,$teacher->notifications()->count());
        $this->assertSame('REV-2026-2',$applied->letter_no);
    }

    public function test_future_approval_does_not_replace_cache_until_due_and_same_day_overlap_is_rejected(): void
    {
        [$i,$admin]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);
        $first=$this->initial($admin,'teacher',$profile->id);$this->revisionService()->transition($admin,$first->id,'approve');
        $future=$this->increment($admin,'teacher',$profile->id,['effective_from'=>'2026-10-20']);
        $this->assertSame('approved',$this->revisionService()->transition($admin,$future->id,'approve')->status);
        $this->assertSame('20000.00',$profile->fresh()->salary);
        try{app(SalaryStructureService::class)->apply($future->id,$admin);$this->fail('Future applied early');}
        catch(BusinessException $e){$this->assertSame('revision_conflict',$e->errorCode);}
        $this->travelTo('2026-10-20 12:00:00');
        app(SalaryStructureService::class)->apply($future->id,$admin);
        $this->assertSame('22000.00',$profile->fresh()->salary);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $this->increment($admin,'teacher',$profile->id,['effective_from'=>'2026-10-20']);
    }

    public function test_transaction_rolls_back_period_close_structure_lines_status_and_audit_on_failure(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $first=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$first->id,'approve');
        $next=$this->increment($admin,'staff',$staff->id);
        new SalaryStructureLine();
        $original=SalaryStructureLine::getEventDispatcher();$fault=clone $original;
        SalaryStructureLine::setEventDispatcher($fault);
        $fault->listen('eloquent.creating: '.SalaryStructureLine::class,fn()=>throw new \RuntimeException('fixture line fault'));
        try{
            try{$this->revisionService()->transition($admin,$next->id,'approve');$this->fail('Fault did not occur');}
            catch(\RuntimeException $e){$this->assertSame('fixture line fault',$e->getMessage());}
        }finally{SalaryStructureLine::setEventDispatcher($original);}
        $this->assertNull(SalaryStructure::first()->effective_to);
        $this->assertSame(1,SalaryStructure::count());$this->assertSame(1,SalaryStructureLine::count());
        $this->assertSame('proposed',$next->fresh()->status);
        $this->assertSame(1,AuditLog::where('action','salary.revision.approved')->count());
    }
}
