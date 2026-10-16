<?php

namespace Tests\Feature\Auth;

use App\Models\{AccountActivationRequest, DepartmentDuty, DepartmentDutyAssignment, DepartmentMembership, InstitutionDepartment, InstitutionRegistration, OtpToken};
use App\Services\Privacy\TenantPurgeService;
use App\Support\Tenancy;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class DepartmentFoundationTest extends TestCase
{
    use RefreshDatabase;

    private const MODELS = [InstitutionRegistration::class, AccountActivationRequest::class, InstitutionDepartment::class, DepartmentMembership::class, DepartmentDuty::class, DepartmentDutyAssignment::class];

    private function fixture(): array
    {
        return array_map(fn ($model) => $model::factory()->create(), self::MODELS);
    }

    public function test_factories_are_scoped_and_private_proof_is_hidden(): void
    {
        $a = $this->makeInstitution('department-a');
        $b = $this->makeInstitution('department-b');
        $rows = Tenancy::as($a, fn () => $this->fixture());
        Tenancy::as($b, fn () => $this->fixture());
        Tenancy::as($a, function () use ($rows, $b) {
            foreach ($rows as $row) {
                $this->assertSame($row->institution_id, Tenancy::current()->id);
                $this->assertFalse($row::where('institution_id', $b->id)->exists());
                try { $row->update(['institution_id' => $b->id]); $this->fail('Tenant moved'); }
                catch (\LogicException $e) { $this->assertStringContainsString('immutable', $e->getMessage()); }
            }
            $this->assertArrayNotHasKey('rejection_reason', $rows[0]->toArray());
            foreach (['contact_hash', 'otp_token_id'] as $field) $this->assertArrayNotHasKey($field, $rows[1]->toArray());
            $assignment = $rows[5]->refresh();
            $this->assertSame(DepartmentMembership::findOrFail($assignment->membership_id)->department_id, DepartmentDuty::findOrFail($assignment->duty_id)->department_id);
            $this->assertSame([], $rows[4]->permission_keys);
        });
    }

    public function test_composite_foreign_keys_reject_every_foreign_tenant_link(): void
    {
        $a = $this->makeInstitution('fk-a'); $b = $this->makeInstitution('fk-b');
        $rows = Tenancy::as($a, fn () => $this->fixture());
        $other = Tenancy::as($b, fn () => $this->fixture());
        $foreignUser = $other[0]->first_admin_id;
        $links = [
            ['first_admin_id' => $foreignUser], ['user_id' => $foreignUser],
            ['created_by' => $foreignUser, 'updated_by' => $foreignUser],
            ['department_id' => $other[2]->id, 'user_id' => $foreignUser, 'created_by' => $foreignUser],
            ['department_id' => $other[2]->id, 'created_by' => $foreignUser, 'updated_by' => $foreignUser],
            ['membership_id' => $other[3]->id, 'duty_id' => $other[4]->id, 'assigned_by' => $foreignUser, 'revoked_by' => $foreignUser],
        ];
        foreach ($rows as $index => $row) foreach ($links[$index] as $column => $value) {
            try {
                DB::table($row->getTable())->where('institution_id', $a->id)->where('id', $row->id)->update([$column => $value]);
                $this->fail('Cross-tenant FK accepted: '.$row->getTable().'.'.$column);
            } catch (QueryException $e) { $this->assertSame('23000', $e->errorInfo[0]); }
        }
    }

    public function test_unique_keys_reject_duplicates_but_allow_tenant_local_codes(): void
    {
        $a = $this->makeInstitution('unique-a'); $b = $this->makeInstitution('unique-b');
        $rows = Tenancy::as($a, fn () => $this->fixture());
        foreach ($rows as $row) {
            $data = $row->getAttributes(); unset($data['id']);
            try { DB::table($row->getTable())->insert($data); $this->fail('Duplicate identity accepted'); }
            catch (QueryException $e) { $this->assertSame('23000', $e->errorInfo[0]); }
        }
        Tenancy::as($b, fn () => InstitutionDepartment::factory()->create(['code' => $rows[2]->code, 'name' => $rows[2]->name]));
        Tenancy::as($a, function () use ($rows) {
            AccountActivationRequest::factory()->create(['user_id' => $rows[1]->user_id, 'generation' => 2]);
            $this->assertSame(2, AccountActivationRequest::count());
        });
    }

    public function test_purge_removes_activation_before_otp_and_preserves_other_tenant(): void
    {
        $a = $this->makeInstitution('purge-foundation', 'school', 'expired');
        $a->forceFill(['subscription_expires_at' => now()->subDays(40)])->save();
        $b = $this->makeInstitution('keep-foundation');
        $rows = Tenancy::as($a, fn () => $this->fixture());
        Tenancy::as($b, fn () => $this->fixture());
        $otp = OtpToken::create(['user_id' => $rows[1]->user_id, 'otp' => 'fixture-hash', 'expires_at' => now()->addMinutes(5)]);
        Tenancy::as($a, fn () => $rows[1]->update(['otp_token_id' => $otp->id]));
        $super = $this->makeUser(null, 'super_admin');
        $result = app(TenantPurgeService::class)->execute($a, $super->id);
        $this->assertSame(1, $result['tables']['account_activation_requests']);
        $this->assertNull(OtpToken::find($otp->id));
        foreach ($rows as $row) {
            $this->assertSame(0, DB::table($row->getTable())->where('institution_id', $a->id)->count());
            $this->assertGreaterThan(0, DB::table($row->getTable())->where('institution_id', $b->id)->count());
        }
    }
}
