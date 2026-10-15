<?php
namespace Tests\Feature\Hr;

use App\Services\Hr\AttendanceSummary;

class LeavePayrollLinkTest extends LeaveTestCase
{
    public function test_both_payees_paid_unpaid_month_splits_and_cancelled_rejected_exclusion(): void
    {
        [$i,$admin,$staff,$type]=$this->setupHr();[$teacher,$profile]=$this->teacher($i);
        $type->update(['is_paid'=>false]);
        foreach ([['staff_id'=>$staff->id],['user_id'=>$teacher->id]] as $person) {
            $row=$this->service()->create($person+['leave_type_id'=>$type->id,'from_date'=>'2026-10-31','to_date'=>'2026-11-01'],$admin);
            $this->service()->transition($row->id,'approve',[],$admin);
        }
        $summary=app(AttendanceSummary::class);
        foreach ([['staff',$staff->id],['teacher',$profile->id]] as [$kind,$id]) {
            $this->assertSame(1,$summary->forPayee($kind,$id,'2026-10')['lwp_days']);
            $this->assertSame(1,$summary->forPayee($kind,$id,'2026-11')['lwp_days']);
        }
        $type->update(['is_paid'=>true]);
        $paid=$this->service()->create($this->input($staff,$type,'2026-11-02','2026-11-02'),$admin);
        $this->service()->transition($paid->id,'approve',[],$admin);
        $this->assertSame(1,$summary->forPayee('staff',$staff->id,'2026-11')['lwp_days']);
        $this->assertSame(2,$summary->forPayee('staff',$staff->id,'2026-11')['leave_days']);
        $this->service()->transition($paid->id,'cancel',['reason'=>'Cancel'],$admin);
        $rejected=$this->service()->create($this->input($staff,$type,'2026-11-03','2026-11-03'),$admin);
        $this->service()->transition($rejected->id,'reject',[],$admin);
        $this->assertSame(1,$summary->forPayee('staff',$staff->id,'2026-11')['leave_days']);
    }
}
