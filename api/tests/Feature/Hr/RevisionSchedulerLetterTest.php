<?php
namespace Tests\Feature\Hr;
use App\Models\SalaryStructure;
use App\Services\Hr\RevisionLetterService;

class RevisionSchedulerLetterTest extends RevisionTestCase
{
    public function test_due_scheduler_is_idempotent_and_letter_is_real_pdf(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $row=$this->initial($admin,'staff',$staff->id,['effective_from'=>'2026-10-20']);
        $this->revisionService()->transition($admin,$row->id,'approve');
        $this->artisan('payroll:apply-revisions')->expectsOutputToContain('applied=0 blocked=0')->assertSuccessful();
        $this->travelTo('2026-10-20 12:00:00');
        $this->artisan('payroll:apply-revisions')->expectsOutputToContain('applied=1 blocked=0')->assertSuccessful();
        $this->artisan('payroll:apply-revisions')->expectsOutputToContain('applied=0 blocked=0')->assertSuccessful();
        $this->assertSame(1,SalaryStructure::count());
        $this->assertStringStartsWith('%PDF-',app(RevisionLetterService::class)->render($admin,$row->id));
    }
    public function test_scheduler_reports_stale_revision_without_modifying_structure_or_leaking_amounts(): void
    {
        [$i,$admin,$staff]=$this->setupHr();
        $row=$this->initial($admin,'staff',$staff->id,['effective_from'=>'2026-10-20']);
        $this->revisionService()->transition($admin,$row->id,'approve');
        $i->update(['settings'=>['payroll'=>['min_basic'=>'100.00']]]);
        $this->travelTo('2026-10-20 12:00:00');
        $this->artisan('payroll:apply-revisions')->expectsOutputToContain('applied=0 blocked=1')->assertFailed();
        $this->assertSame(0,SalaryStructure::count());
        $this->assertSame('approved',$row->fresh()->status);
    }
}
