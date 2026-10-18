<?php
namespace Tests\Feature\Hr;

use Illuminate\Validation\ValidationException;

class LeaveOverlapTest extends LeaveTestCase
{
    public function test_pending_ranges_block_overlap_without_reserving_balance(): void
    {
        [$i,$admin,$staff,$type] = $this->setupHr();
        $type->update(['max_days_per_year' => 2]);
        $this->service()->create($this->input($staff,$type,'2026-10-20','2026-10-21'),$admin);
        $other = $this->service()->create($this->input($staff,$type,'2026-10-22','2026-10-23'),$admin);
        $this->assertSame('pending',$other->status);
        $this->assertSame(0,$this->service()->consumed(null,$staff->id,$type->id,2026));
        $this->expectException(ValidationException::class);
        $this->service()->create($this->input($staff,$type,'2026-10-21','2026-10-22'),$admin);
    }
}
