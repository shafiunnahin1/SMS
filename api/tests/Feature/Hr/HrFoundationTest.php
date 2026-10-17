<?php

namespace Tests\Feature\Hr;

use App\Models\{Holiday, LeaveApplication, LeaveType, StaffAttendance, StaffMember, TeacherAttendance};
use App\Services\Hr\HrCalendar;
use App\Support\Tenancy;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class HrFoundationTest extends TestCase
{
    use RefreshDatabase;

    public function test_models_factories_and_calendar_are_tenant_bound(): void
    {
        $a = $this->makeInstitution('hr-a'); $b = $this->makeInstitution('hr-b');
        foreach ([$a, $b] as $i) Tenancy::as($i, function () {
            StaffAttendance::factory()->create();
            TeacherAttendance::factory()->create();
            LeaveApplication::factory()->create();
        });
        Tenancy::as($a, function () {
            $this->assertSame(2, StaffMember::count());
            $this->assertSame(1, LeaveApplication::count());
            $this->assertSame(1, TeacherAttendance::count());
            $this->assertSame(1, LeaveType::count());
            $this->assertSame(1, StaffAttendance::count());
            StaffMember::factory()->create(['employee_id' => 'SHARED']);
        });
        Tenancy::as($b, fn () => StaffMember::factory()->create(['employee_id' => 'SHARED']));
        Tenancy::as($a, function () {
            $this->expectException(QueryException::class);
            StaffMember::factory()->create(['employee_id' => 'SHARED']);
        });
    }

    public function test_attendance_uniqueness_is_enforced_by_database(): void
    {
        Tenancy::as($this->makeInstitution('hr-unique'), function () {
            $row = StaffAttendance::factory()->create();
            $this->expectException(QueryException::class);
            StaffAttendance::factory()->create(['staff_id' => $row->staff_id, 'date' => $row->date->toDateString()]);
        });
    }

    public function test_calendar_excludes_only_configured_weekly_and_tenant_holidays_across_years(): void
    {
        $a = $this->makeInstitution('hr-calendar'); $b = $this->makeInstitution('hr-other');
        Tenancy::as($b, fn () => Holiday::create(['title' => 'Other', 'date' => '2027-01-01']));
        Tenancy::as($a, function () use ($a) {
            $calendar = app(HrCalendar::class);
            $this->assertSame(['2026-12-31','2027-01-01','2027-01-02','2027-01-03'], $calendar->dates('2026-12-31','2027-01-03'));
            $a->update(['settings' => ['hr' => ['weekly_holidays' => [5,6]]]]);
            Holiday::create(['title' => 'Own', 'date' => '2027-01-03', 'type' => 'optional']);
            $this->assertSame(['2026-12-31'], $calendar->dates('2026-12-31','2027-01-03'));
            $this->assertSame([], $calendar->dates('2027-01-01','2027-01-03'));
        });
    }

    public function test_malformed_calendar_fails_closed(): void
    {
        $a = $this->makeInstitution('hr-invalid');
        $a->update(['settings' => ['hr' => ['weekly_holidays' => ['5']]]]);
        Tenancy::as($a, function () {
            $this->expectException(ValidationException::class);
            app(HrCalendar::class)->dates('2026-10-01','2026-10-02');
        });
    }

    public function test_cross_tenant_model_write_is_rejected(): void
    {
        $a = $this->makeInstitution('hr-write-a'); $b = $this->makeInstitution('hr-write-b');
        Tenancy::as($a, function () use ($b) {
            $this->expectException(\LogicException::class);
            LeaveType::factory()->create(['institution_id' => $b->id]);
        });
    }
}
