<?php
namespace Tests\Feature\Hr;

use App\Models\{Holiday, StaffAttendance};
use App\Services\Hr\AttendanceSummary;

class AttendanceSummaryTest extends LeaveTestCase
{
    public function test_snapshot_survives_calendar_changes_and_approved_leave_wins_without_double_count(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();
        $staff->update(['joining_date'=>'2026-10-20','leaving_date'=>'2026-10-22']);
        $type->update(['is_paid'=>false]);
        $leave=$this->service()->create($this->input($staff,$type),$admin);
        $this->service()->transition($leave->id,'approve',[],$admin);
        StaffAttendance::factory()->create(['staff_id'=>$staff->id,'date'=>'2026-10-20','status'=>'absent']);
        StaffAttendance::factory()->create(['staff_id'=>$staff->id,'date'=>'2026-10-21','status'=>'late']);
        Holiday::create(['title'=>'Later calendar change','date'=>'2026-10-20']);
        $type->update(['is_paid'=>true]);
        $summary=app(AttendanceSummary::class)->forPayee('staff',$staff->id,'2026-10');
        $this->assertSame(['working_days'=>3,'present_days'=>1,'absent_days'=>1,'leave_days'=>1,'lwp_days'=>1,'late_count'=>1],$summary);
        $this->assertSame(1,$this->service()->consumed(null,$staff->id,$type->id,2026));
        $this->assertSame(0,app(AttendanceSummary::class)->forPayee('staff',$staff->id,'2026-11')['working_days']);
    }
}
