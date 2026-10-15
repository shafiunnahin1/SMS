<?php

namespace Tests\Feature\Refunds;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, FeePayment, FeeRefund, User};
use App\Support\Tenancy;
use Illuminate\Database\QueryException;

class RefundImmutabilityTest extends RefundTestCase
{
    public function test_create_and_transition_retries_preserve_immutable_snapshots_and_root_identity(): void
    {
        [$i, $admin] = $this->tenant(); $line = $this->fee($i, '100.00'); $input = $this->payload($line);
        $id = $this->requestRefund($i, $admin, $input);
        $this->assertSame($id, $this->requestRefund($i, $admin, $input));
        $this->api('POST', $this->hostOf($i), 'fee-refunds', $admin, array_replace($input, ['reason' => 'Changed']))->assertConflict();
        $before = $this->snapshots($i, $id)->first()->getAttributes();
        $this->process($i, $admin, $id);
        $this->move($i, $admin, $id, 'approve')->assertOk();
        $this->move($i, $admin, $id, 'process')->assertOk();
        $this->assertSame($id, $this->requestRefund($i, $admin, $input));
        $rows = $this->snapshots($i, $id); $this->assertCount(3, $rows);
        $this->assertSame($before, $rows->first()->getAttributes());
        $this->api('GET', $this->hostOf($i), 'fee-refunds/' . $rows->last()->id, $admin)->assertNotFound();
        $this->api('GET', $this->hostOf($i), 'fee-refunds?status=processed', $admin)->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
        $this->api('GET', $this->hostOf($i), 'fee-refunds?status=requested', $admin)->assertJsonCount(0, 'data');
        Tenancy::as($i, function () use ($rows, $line) {
            foreach ([$rows->first(), $line] as $row) {
                try { $row->update(['amount' => '9.00']); $this->fail('financial update accepted'); }
                catch (BusinessException $error) { $this->assertSame(409, $error->status); }
                try { $row->fresh()->delete(); $this->fail('financial delete accepted'); }
                catch (BusinessException $error) { $this->assertSame(409, $error->status); }
            }
            try { FeeRefund::create($rows->first()->only(['student_id','request_key','revision','original_receipt_no','amount','refund_lines','reason'])); $this->fail('duplicate revision accepted'); }
            catch (QueryException $error) { $this->assertSame('23000', (string) $error->getCode()); }
            $this->assertSame(1, FeePayment::whereNotNull('reverses_id')->count());
        });
    }

    public function test_roles_self_approval_exception_and_stale_transitions_are_enforced(): void
    {
        [$i, $admin] = $this->tenant(); $accountant = $this->makeUser($i, 'accountant'); $line = $this->fee($i, '100.00');
        $id = $this->requestRefund($i, $accountant, $this->payload($line));
        $this->move($i, $accountant, $id, 'approve')->assertForbidden();
        $this->move($i, $accountant, $id, 'process')->assertConflict();
        $this->move($i, $admin, $id, 'approve')->assertOk(); $this->move($i, $accountant, $id, 'process')->assertOk();
        $own = $this->requestRefund($i, $admin, $this->payload($line, '10.00'));
        $second = User::create(['institution_id' => $i->id, 'name' => 'Second admin', 'email' => 'second@example.test', 'password' => 'fixture', 'role' => 'admin', 'is_active' => true]);
        $this->move($i, $admin, $own, 'approve')->assertForbidden();
        $this->move($i, $second, $own, 'reject')->assertOk();
        $this->move($i, $second, $own, 'reject')->assertOk(); $this->move($i, $second, $own, 'process')->assertConflict();
        $second->update(['is_active' => false]);
        $solo = $this->requestRefund($i, $admin, $this->payload($line, '10.00')); $this->move($i, $admin, $solo, 'approve')->assertOk();
        $snapshotId = $this->snapshots($i, $solo)->last()->id;
        Tenancy::as($i, fn () => $this->assertTrue((bool) AuditLog::where('action', 'refund.approved')->where('model_id', $snapshotId)->firstOrFail()->new_data['self_approval_exception']));
        foreach (['teacher', 'student', 'parent'] as $role) {
            $user = $this->makeUser($i, $role);
            $this->api('GET', $this->hostOf($i), 'fee-refunds', $user)->assertForbidden();
            $this->api('POST', $this->hostOf($i), 'fee-refunds', $user, $this->payload($line))->assertForbidden();
        }
    }
}
