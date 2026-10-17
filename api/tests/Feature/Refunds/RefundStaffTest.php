<?php

namespace Tests\Feature\Refunds;

use App\Models\User;
use App\Services\DepartmentService;
use App\Support\Tenancy;

// D101 (owner, 2026-10-17): department staff may request and process fee refunds with exact keys; approve/reject stay admin-only.
class RefundStaffTest extends RefundTestCase
{
    private function staff($i, User $admin, array $keys): array
    {
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $staff = $this->makeUser($i, 'institution_staff');
        $department = Tenancy::as($i, function () use ($admin, $staff, $keys) {
            $s = app(DepartmentService::class);
            $d = $s->create($admin, ['name' => 'Accounts']);
            $m = $s->addMember($admin, $d->id, ['user_id' => $staff->id]);
            $duty = $s->createDuty($admin, $d->id, ['code' => 'REFUND', 'name' => 'Refund', 'permission_keys' => $keys]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
            return $d->id;
        });
        return [$staff, $department];
    }

    private function asStaff($i, User $staff, $department, string $method, string $path, array $body = [])
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.$staff->createToken('refund')->plainTextToken];
        if ($department !== null) $headers['X-Department-Id'] = (string) $department;
        return $this->json($method, 'http://'.$this->hostOf($i).'/api/v1/'.$path, $body, $headers);
    }

    public function test_staff_request_and_process_but_never_approve_or_reject(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00');
        [$staff, $d] = $this->staff($i, $admin, ['staff.fee_refund.store', 'staff.fee_refund.index', 'staff.fee_refund.show', 'staff.fee_refund.process']);

        $id = $this->asStaff($i, $staff, $d, 'POST', 'fee-refunds', $this->payload($line))->assertCreated()->json('data.id');
        $this->asStaff($i, $staff, $d, 'GET', 'fee-refunds')->assertOk();
        $this->asStaff($i, $staff, $d, 'GET', "fee-refunds/{$id}")->assertOk();
        $this->asStaff($i, $staff, $d, 'POST', "fee-refunds/{$id}/approve")->assertForbidden();
        $this->asStaff($i, $staff, $d, 'POST', "fee-refunds/{$id}/reject")->assertForbidden();
        $this->asStaff($i, $staff, $d, 'POST', "fee-refunds/{$id}/process")->assertStatus(409);   // not approved yet
        $this->move($i, $admin, $id, 'approve')->assertOk();
        $this->asStaff($i, $staff, $d, 'POST', "fee-refunds/{$id}/process")->assertOk()->assertJsonPath('data.status', 'processed');
        $this->assertCount(3, $this->snapshots($i, $id), 'requested, approved, processed: nothing deleted or rewritten');
    }

    public function test_staff_refunds_fail_closed_without_key_context_or_department_mode(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00');
        [$staff, $d] = $this->staff($i, $admin, ['staff.fee_refund.index']);
        $this->asStaff($i, $staff, $d, 'POST', 'fee-refunds', $this->payload($line))->assertForbidden();
        $this->asStaff($i, $staff, null, 'GET', 'fee-refunds')->assertForbidden();
        $this->asStaff($i, $staff, 999999, 'GET', 'fee-refunds')->assertForbidden();
        $this->asStaff($i, $staff, $d, 'GET', 'fee-refunds')->assertOk();
        $i->forceFill(['staff_department_mode' => 'legacy'])->save();
        $this->asStaff($i, $staff, $d, 'GET', 'fee-refunds')->assertForbidden();
    }
}
