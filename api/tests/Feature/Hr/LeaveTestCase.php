<?php

namespace Tests\Feature\Hr;

use App\Models\{LeaveType, StaffMember, Teacher};
use App\Services\Hr\LeaveService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

abstract class LeaveTestCase extends TestCase
{
    use RefreshDatabase;
    protected function setUp(): void { parent::setUp(); $this->travelTo('2026-10-15 12:00:00'); Queue::fake(); }
    protected function setupHr(): array
    {
        $i = $this->makeInstitution('hr-leave'); $this->bindTenant($i);
        $admin = $this->makeUser($i, 'admin');
        return [$i, $admin, StaffMember::factory()->create(), LeaveType::factory()->create()];
    }
    protected function input($staff, $type, string $from = '2026-10-20', string $to = '2026-10-20'): array
    {
        return ['staff_id' => $staff->id, 'leave_type_id' => $type->id, 'from_date' => $from, 'to_date' => $to, 'reason' => 'Fixture'];
    }
    protected function service(): LeaveService { return app(LeaveService::class); }
    protected function teacher($i): array
    {
        $u = $this->makeUser($i, 'teacher');
        return [$u, Teacher::create(['user_id' => $u->id, 'employee_id' => 'T-1', 'status' => 'active'])];
    }
}
