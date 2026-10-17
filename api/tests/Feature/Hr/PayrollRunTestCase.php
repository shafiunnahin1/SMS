<?php
namespace Tests\Feature\Hr;
use App\Models\{PayrollRun,User};
use App\Services\Hr\PayrollRunService;

abstract class PayrollRunTestCase extends RevisionTestCase
{
    protected function runs(): PayrollRunService { return app(PayrollRunService::class); }
    /** a school with one staff payee on an approved initial structure (basic 20,000 + house rent 40%) from 1 Oct 2026 */
    protected function payroll(): array
    {
        [$i,$admin,$staff]=$this->setupHr();
        $revision=$this->initial($admin,'staff',$staff->id);$this->revisionService()->transition($admin,$revision->id,'approve');
        return [$i,$admin,$staff,$this->makeUser($i,'accountant')];
    }
    protected function draft(User $by,string $month='2026-10',array $extra=[]): PayrollRun
    {
        return $this->runs()->create($by,['month'=>$month]+$extra);
    }
}
