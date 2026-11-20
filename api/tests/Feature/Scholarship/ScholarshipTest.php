<?php

namespace Tests\Feature\Scholarship;

use App\Models\{AcademicYear, AuditLog, Batch, FeeCategory, Program, Scholarship, ScholarshipApplication, Student, User};
use App\Services\FeeService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// D236 SCH.1 (advanced-features.md section 8): exactly one benefit; parent / student / office apply once; slots; decided once, an
// approval can be revoked (slot back); a percentage award lowers the monthly tuition from the approval month to the revocation
// month only (paid rows untouched, other categories untouched); a fixed amount is a grant only; one notice per decision; staff keys.
class ScholarshipTest extends TestCase
{
    use RefreshDatabase;

    public function test_create_apply_award_discount_and_revoke(): void
    {
        Queue::fake();
        $this->travelTo('2026-11-20 10:00:00');
        $i = $this->makeInstitution('sch1', 'school');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        [$rafi, $nila, $year] = Tenancy::as($i, function () {
            FeeCategory::create(['name' => 'Tuition', 'amount' => '1000', 'frequency' => 'monthly']);
            FeeCategory::create(['name' => 'Admission', 'amount' => '500', 'frequency' => 'once']);
            $b = Batch::create(['program_id' => Program::create(['name' => 'Class 8'])->id, 'name' => 'A']);
            $mk = function (string $name, string $phone) use ($b) {
                $s = app(\App\Services\StudentService::class)->create(['name' => $name, 'guardian_phone' => $phone], $b);
                $s->activeEnrollments()->update(['enrolled_at' => '2026-09-01']);
                return $s;
            };
            $y = AcademicYear::create(['name' => '2026', 'start_date' => '2026-01-01', 'end_date' => '2026-12-31', 'is_current' => true]);
            return [$mk('Rafi', '01711111111'), $mk('Nila', '01733333333'), $y];
        });
        $dues = fn (Student $s) => Tenancy::as($i, fn () => app(FeeService::class)->dueLines($s->fresh())->mapWithKeys(fn ($l) => [$l['category'] . ':' . $l['period'] => $l['amount']])->all());
        $this->assertSame(['Tuition:2026-09' => '1000.00', 'Tuition:2026-10' => '1000.00', 'Tuition:2026-11' => '1000.00', 'Admission:once' => '500.00'], $dues($rafi));

        // exactly one benefit
        $this->api('POST', $host, 'scholarships', $admin, ['name' => 'X'])->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->api('POST', $host, 'scholarships', $admin, ['name' => 'X', 'amount' => '100', 'percentage' => '10'])->assertStatus(422)->assertJsonValidationErrors('amount');
        $this->api('POST', $host, 'scholarships', $admin, ['name' => 'X', 'percentage' => '120'])->assertStatus(422)->assertJsonValidationErrors('percentage');
        $half = $this->api('POST', $host, 'scholarships', $admin, ['name' => 'Merit half-tuition', 'percentage' => '50', 'academic_year_id' => $year->id, 'total_slots' => 1, 'application_deadline' => '2026-11-30', 'funded_by' => 'School'])
            ->assertCreated()->assertJsonPath('data.available_slots', 1)->assertJsonPath('data.benefit', 'percentage')->json('data');
        $grant = $this->api('POST', $host, 'scholarships', $admin, ['name' => 'Book grant', 'amount' => '2500.50'])->assertCreated()->json('data');

        // applications: parent for own child, office for any, student for themself; once each
        $parent = Tenancy::as($i, fn () => $rafi->parents()->first());
        $parent->forceFill(['must_change_password' => false])->save();
        $this->api('POST', $host, "scholarships/{$half['id']}/apply", $parent, ['student_id' => $nila->id, 'reason' => 'x'])->assertNotFound();
        $ra = $this->api('POST', $host, "scholarships/{$half['id']}/apply", $parent, ['student_id' => $rafi->id, 'reason' => 'Top of the class', 'gpa' => '4.80', 'household_income' => 'below 20000'])->assertCreated()->json('data');
        $this->api('POST', $host, "scholarships/{$half['id']}/apply", $admin, ['student_id' => $rafi->id, 'reason' => 'again'])->assertStatus(422)->assertJsonValidationErrors('student_id');
        $na = $this->api('POST', $host, "scholarships/{$half['id']}/apply", $admin, ['student_id' => $nila->id, 'reason' => 'Needs support'])->assertCreated()->json('data');
        $stu = Tenancy::as($i, fn () => $rafi->fresh()->user);
        $stu->forceFill(['role' => 'student', 'must_change_password' => false, 'is_active' => true])->save();
        $this->api('POST', $host, "scholarships/{$grant['id']}/apply", $stu, ['student_id' => $nila->id, 'reason' => 'x'])->assertStatus(422);
        $ga = $this->api('POST', $host, "scholarships/{$grant['id']}/apply", $stu, ['reason' => 'Books'])->assertCreated()->json('data');
        $mine = $this->api('GET', $host, 'student/scholarships', $stu)->assertOk()->json('data');
        $this->assertEqualsCanonicalizing([$ra['id'], $ga['id']], array_column($mine['applications'], 'id'));
        $this->assertSame([true, true], array_column($mine['open'], 'applied'));

        // decide: one slot; final; notices
        $this->api('PATCH', $host, "scholarships/applications/{$ra['id']}/award", $admin, ['decision' => 'approved'])->assertOk()->assertJsonPath('data.status', 'approved')->assertJsonPath('data.awarded_amount', null);
        $this->api('PATCH', $host, "scholarships/applications/{$ra['id']}/award", $admin, ['decision' => 'rejected'])->assertStatus(422);
        $this->api('PATCH', $host, "scholarships/applications/{$na['id']}/award", $admin, ['decision' => 'approved'])->assertStatus(422)->assertJsonValidationErrors('decision');
        $this->api('PATCH', $host, "scholarships/applications/{$na['id']}/award", $admin, ['decision' => 'rejected'])->assertOk()->assertJsonPath('data.status', 'rejected');
        $this->assertSame(['awarded', 0], Tenancy::as($i, fn () => [Scholarship::find($half['id'])->status, Scholarship::find($half['id'])->available_slots]));
        $this->api('PATCH', $host, "scholarships/applications/{$ga['id']}/award", $admin, ['decision' => 'approved'])->assertOk()->assertJsonPath('data.awarded_amount', '2500.50');
        $this->assertSame(2, $parent->notifications()->where('data->type', 'scholarship_decision')->count(), 'one notice per decision for Rafi');

        // the tuition from the approval month only; the admission fee and the grant never touch fees
        $this->assertSame(['Tuition:2026-09' => '1000.00', 'Tuition:2026-10' => '1000.00', 'Tuition:2026-11' => '500.00', 'Admission:once' => '500.00'], $dues($rafi));
        $this->assertSame('1000.00', $dues($nila)['Tuition:2026-11']);
        $line = Tenancy::as($i, fn () => app(FeeService::class)->dueLines($rafi->fresh())->firstWhere('period', '2026-11'));
        $this->assertSame(['1000.00', '500.00'], [$line['gross'], $line['discount']]);
        $paid = Tenancy::as($i, fn () => app(FeeService::class)->collect($rafi->fresh(), [['key' => $line['key']]]))->first();
        $this->assertSame(['1000.00', '500.00', '500.00'], [(string) $paid->amount, (string) $paid->discount, (string) $paid->paid_amount]);

        // next month: still discounted; revoked in December -> December full, November's paid row untouched, slot back
        $this->travelTo('2026-12-05 10:00:00');
        $this->assertSame('500.00', $dues($rafi)['Tuition:2026-12']);
        $this->api('PATCH', $host, "scholarships/applications/{$ra['id']}/revoke", $admin, [])->assertStatus(422)->assertJsonValidationErrors('reason');
        $this->api('PATCH', $host, "scholarships/applications/{$ra['id']}/revoke", $admin, ['reason' => 'Left the merit list'])->assertOk()->assertJsonPath('data.status', 'rejected');
        $this->api('PATCH', $host, "scholarships/applications/{$ra['id']}/revoke", $admin, ['reason' => 'again'])->assertStatus(422);
        $this->assertSame('1000.00', $dues($rafi)['Tuition:2026-12']);
        $this->assertArrayNotHasKey('Tuition:2026-11', $dues($rafi));
        $this->assertSame('500.00', (string) Tenancy::as($i, fn () => $paid->fresh()->paid_amount));
        $this->assertSame(['open', 1], Tenancy::as($i, fn () => [Scholarship::find($half['id'])->status, Scholarship::find($half['id'])->available_slots]));
        $this->assertSame(3, $parent->notifications()->where('data->type', 'scholarship_decision')->count());
        $this->assertSame(3, Tenancy::as($i, fn () => ScholarshipApplication::count()), 'never deleted');
        $this->assertSame(1, Tenancy::as($i, fn () => AuditLog::where('action', 'scholarship.revoked')->count()));

        // the benefit is fixed once applied; slots never below the awards; closed and past the deadline take no applications
        $this->api('PUT', $host, "scholarships/{$grant['id']}", $admin, ['amount' => '100'])->assertStatus(422);
        $this->api('PUT', $host, "scholarships/{$grant['id']}", $admin, ['name' => 'Book and uniform grant'])->assertOk()->assertJsonPath('data.name', 'Book and uniform grant');
        $this->api('PATCH', $host, "scholarships/{$grant['id']}/close", $admin)->assertOk()->assertJsonPath('data.status', 'closed');
        $this->api('POST', $host, "scholarships/{$grant['id']}/apply", $admin, ['student_id' => $nila->id, 'reason' => 'x'])->assertStatus(422)->assertJsonValidationErrors('scholarship');
        $late = $this->api('POST', $host, 'scholarships', $admin, ['name' => 'Late', 'percentage' => '10', 'application_deadline' => '2026-12-01'])->json('data');
        $this->api('POST', $host, "scholarships/{$late['id']}/apply", $admin, ['student_id' => $nila->id, 'reason' => 'x'])->assertStatus(422);
        $this->assertCount(3, $this->api('GET', $host, 'scholarships', $admin)->assertOk()->json('data'));
        $this->assertCount(2, $this->api('GET', $host, "scholarships/{$half['id']}/applications", $admin)->assertOk()->json('data.applications'));
        $child = $this->api('GET', $host, "parent/children/{$rafi->id}/scholarships", $parent)->assertOk()->json('data');
        $this->assertArrayNotHasKey('decided_by', $child['applications'][0]);
        $this->api('GET', $host, "parent/children/{$nila->id}/scholarships", $parent)->assertNotFound();
        $this->api('GET', $host, 'scholarships', $parent)->assertForbidden();

        // staff: read does not imply manage
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $staff = function (string $name, array $keys) use ($i, $admin) {
            $u = User::create(['institution_id' => $i->id, 'name' => $name, 'email' => strtolower($name) . '@example.test', 'password' => 'Secret@1234', 'role' => 'institution_staff', 'is_active' => true]);
            $u->forceFill(['must_change_password' => false])->save();
            $dep = Tenancy::as($i, function () use ($u, $name, $keys, $admin) {
                $svc = app(\App\Services\DepartmentService::class);
                $dep = $svc->create($admin, ['name' => "Dept {$name}"]);
                $m = $svc->addMember($admin, $dep->id, ['user_id' => $u->id]);
                $svc->assignDuties($admin, $m->id, ['duty_ids' => [$svc->createDuty($admin, $dep->id, ['code' => strtoupper($name), 'name' => $name, 'permission_keys' => $keys])->id]]);
                return $dep->id;
            });
            return [$u, $dep];
        };
        $as = function (User $u, int $dep, string $method, string $path, array $body = []) use ($host) {
            $this->app['auth']->forgetGuards();
            return $this->json($method, "http://{$host}/api/v1/{$path}", $body, ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken, 'X-Department-Id' => (string) $dep]);
        };
        [$reader, $rd] = $staff('SchReader', ['staff.scholarship.read']);
        [$keeper, $kd] = $staff('SchKeeper', ['staff.scholarship.manage']);
        $as($reader, $rd, 'GET', 'scholarships')->assertOk();
        $as($reader, $rd, 'POST', 'scholarships', ['name' => 'R', 'percentage' => '5'])->assertForbidden();
        $as($keeper, $kd, 'POST', 'scholarships', ['name' => 'K', 'percentage' => '5'])->assertCreated();

        // another institution: not found
        $j = $this->makeInstitution('sch2', 'school');
        $other = $this->makeUser($j, 'admin');
        $this->api('PATCH', $this->hostOf($j), "scholarships/applications/{$ra['id']}/award", $other, ['decision' => 'approved'])->assertNotFound();
        $this->api('GET', $this->hostOf($j), "scholarships/{$half['id']}/applications", $other)->assertNotFound();
    }

    public function test_coaching_has_no_scholarships(): void
    {
        $c = $this->makeInstitution('schc', 'coaching');
        $this->api('GET', $this->hostOf($c), 'scholarships', $this->makeUser($c, 'admin'))->assertForbidden();
    }
}
