<?php

namespace Tests\Feature\Inventory;

use App\Models\User;
use App\Services\DepartmentService;
use App\Support\Tenancy;

// D102 (owner, 2026-10-17): department staff reach the R3.9 store only through exact staff.inventory.* keys and context.
class InventoryStaffTest extends InventoryTestCase
{
    private function staff($i, User $admin, array $keys): array
    {
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $staff = $this->makeUser($i, 'institution_staff');
        $department = Tenancy::as($i, function () use ($admin, $staff, $keys) {
            $s = app(DepartmentService::class);
            $d = $s->create($admin, ['name' => 'Store']);
            $m = $s->addMember($admin, $d->id, ['user_id' => $staff->id]);
            $duty = $s->createDuty($admin, $d->id, ['code' => 'STORE', 'name' => 'Store', 'permission_keys' => $keys]);
            $s->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
            return $d->id;
        });
        return [$staff, $department];
    }

    private function asStaff($i, User $staff, $department, string $method, string $path, array $body = [])
    {
        $this->app['auth']->forgetGuards();
        $headers = ['Authorization' => 'Bearer '.$staff->createToken('store')->plainTextToken];
        if ($department !== null) $headers['X-Department-Id'] = (string) $department;
        return $this->json($method, 'http://'.$this->hostOf($i).'/api/v1/'.$path, $body, $headers);
    }

    public function test_staff_use_the_store_only_with_exact_keys_and_context(): void
    {
        [$i, $admin] = $this->tenant('store-staff');
        [$staff, $d] = $this->staff($i, $admin, ['staff.inventory.item_index', 'staff.inventory.stock']);
        $this->asStaff($i, $staff, $d, 'GET', 'inventory/items')->assertOk();
        $this->asStaff($i, $staff, $d, 'GET', 'inventory/stock')->assertOk();
        $this->asStaff($i, $staff, $d, 'POST', 'inventory/items', ['name' => 'Chalk'])->assertForbidden();   // no item_store key: 403 before validation
        $this->asStaff($i, $staff, $d, 'POST', 'inventory/purchase', [])->assertForbidden();
        $this->asStaff($i, $staff, null, 'GET', 'inventory/items')->assertForbidden();
        $this->asStaff($i, $staff, 999999, 'GET', 'inventory/items')->assertForbidden();
        $i->forceFill(['staff_department_mode' => 'legacy'])->save();
        $this->asStaff($i, $staff, $d, 'GET', 'inventory/items')->assertForbidden();
    }

    public function test_duty_keys_accept_d102_keys_but_still_reject_unknown_ones(): void
    {
        [$i, $admin] = $this->tenant('store-keys');
        $this->staff($i, $admin, ['staff.inventory.movement']);
        $this->expectException(\Illuminate\Validation\ValidationException::class);
        Tenancy::as($i, function () use ($admin) {
            $s = app(DepartmentService::class);
            $d = $s->create($admin, ['name' => 'Bad']);
            $s->createDuty($admin, $d->id, ['code' => 'BAD', 'name' => 'Bad', 'permission_keys' => ['staff.inventory.*']]);
        });
    }
}
