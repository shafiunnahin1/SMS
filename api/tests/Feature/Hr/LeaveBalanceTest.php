<?php
namespace Tests\Feature\Hr;

use App\Models\AuditLog;
use Illuminate\Validation\ValidationException;

class LeaveBalanceTest extends LeaveTestCase
{
    public function test_cross_year_cap_override_snapshot_and_cancellation_balance(): void
    {
        [$i,$admin,$staff,$type] = $this->setupHr(); $type->update(['max_days_per_year'=>1]);
        $leave=$this->service()->create($this->input($staff,$type,'2026-12-31','2027-01-01'),$admin);
        $this->service()->transition($leave->id,'approve',[],$admin);
        $this->assertSame(1,$this->service()->consumed(null,$staff->id,$type->id,2026));
        $this->assertSame(1,$this->service()->consumed(null,$staff->id,$type->id,2027));
        $extra=$this->service()->create($this->input($staff,$type,'2027-01-02','2027-01-02')+['override'=>true,'override_reason'=>'Exceptional'],$admin);
        $this->service()->transition($extra->id,'approve',['override'=>true,'override_reason'=>'Exceptional'],$admin);
        $this->assertSame(2,$this->service()->consumed(null,$staff->id,$type->id,2027));
        $this->assertTrue(AuditLog::where('action','leave.approved')->where('model_id',$extra->id)->first()->new_data['override']);
        $this->service()->transition($extra->id,'cancel',['reason'=>'No longer needed'],$admin);
        $this->assertSame(1,$this->service()->consumed(null,$staff->id,$type->id,2027));
    }
    public function test_approval_rechecks_cap_and_rolls_back_when_other_pending_request_was_approved(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();$type->update(['max_days_per_year'=>1]);
        $a=$this->service()->create($this->input($staff,$type),$admin);
        $b=$this->service()->create($this->input($staff,$type,'2026-10-21','2026-10-21'),$admin);
        $this->service()->transition($a->id,'approve',[],$admin);
        try { $this->service()->transition($b->id,'approve',[],$admin); $this->fail('Expected cap validation'); }
        catch (ValidationException $e) { $this->assertArrayHasKey('leave_type_id',$e->errors()); }
        $this->assertSame('pending',$b->fresh()->status);
    }
}
