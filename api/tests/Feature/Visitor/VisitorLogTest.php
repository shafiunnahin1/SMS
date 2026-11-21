<?php

namespace Tests\Feature\Visitor;

use App\Models\{AuditLog, User, VisitorLog};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

// D240 VIS.1 (extended-features.md section 8): check in (name and purpose required, photo on the private disk), check out once, the
// day's inside / left lists with search, the admin's same-day correction audited without private values, the report with counts,
// staff keys, teachers out, coaching without the module, photos removed after 90 days, another institution 404.
class VisitorLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_check_in_out_correct_report_and_privacy(): void
    {
        Storage::fake('private');
        $this->travelTo('2026-11-21 09:00:00');
        $i = $this->makeInstitution('vis1', 'school');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);

        $this->api('POST', $host, 'visitors/check-in', $admin, ['visitor_name' => 'Karim'])->assertStatus(422)->assertJsonValidationErrors('purpose');
        $karim = $this->api('POST', $host, 'visitors/check-in', $admin, ['visitor_name' => 'Karim Uddin', 'visitor_phone' => '01711111111', 'purpose' => 'Admission enquiry',
            'whom_to_meet' => 'Principal', 'id_type' => 'nid', 'id_number' => '1990123456789', 'badge_no' => 'V-07', 'photo' => UploadedFile::fake()->image('k.jpg')])->assertCreated()->json('data');
        $this->assertTrue($karim['has_photo']);
        $this->assertNotNull($karim['photo_url']);
        $path = Tenancy::as($i, fn () => VisitorLog::find($karim['id'])->photo);
        $this->assertStringStartsWith("institutions/{$i->id}/visitors/", $path);
        Storage::disk('private')->assertExists($path);
        $this->travel(30)->minutes();
        $rahima = $this->api('POST', $host, 'visitors/check-in', $admin, ['visitor_name' => 'Rahima', 'purpose' => 'admission enquiry'])->assertCreated()->json('data');

        $this->api('PATCH', $host, "visitors/{$karim['id']}/check-out", $admin)->assertOk()->assertJsonPath('data.visitor_name', 'Karim Uddin');
        $this->api('PATCH', $host, "visitors/{$karim['id']}/check-out", $admin)->assertStatus(422);
        $day = $this->api('GET', $host, 'visitors', $admin)->assertOk()->json('data');
        $this->assertSame([[$rahima['id']], [$karim['id']]], [array_column($day['inside'], 'id'), array_column($day['left'], 'id')]);
        $this->assertSame([$karim['id']], array_column($this->api('GET', $host, 'visitors', $admin, ['q' => '0171111'])->json('data.left'), 'id'));

        // the same-day correction: audited by field names, private values never in the log
        $this->api('PUT', $host, "visitors/{$karim['id']}", $admin, ['purpose' => 'Fee enquiry', 'id_number' => '1990999999999'])->assertOk()->assertJsonPath('data.purpose', 'Fee enquiry');
        $log = Tenancy::as($i, fn () => AuditLog::where('action', 'visitor.corrected')->sole());
        $this->assertEqualsCanonicalizing(['purpose', 'id_number'], $log->new_data['fields']);
        $this->assertSame(['purpose' => 'Admission enquiry'], $log->new_data['was']);
        $this->assertStringNotContainsString('1990', json_encode(Tenancy::as($i, fn () => AuditLog::pluck('new_data')->all())));
        $this->assertStringNotContainsString('01711111111', json_encode(Tenancy::as($i, fn () => AuditLog::pluck('new_data')->all())));

        $this->travel(1)->days();
        $this->api('PUT', $host, "visitors/{$karim['id']}", $admin, ['purpose' => 'x'])->assertStatus(422)->assertJsonValidationErrors('check_in');
        $this->api('POST', $host, 'visitors/check-in', $admin, ['visitor_name' => 'Jamal', 'purpose' => 'Delivery'])->assertCreated();

        $report = $this->api('GET', $host, 'visitors/report', $admin, ['from' => '2026-11-21', 'to' => '2026-11-22'])->assertOk()->json('data');
        $this->assertSame(3, $report['total']);
        $this->assertSame(['2026-11-21' => 2, '2026-11-22' => 1], $report['per_day']);
        $purposes = $report['per_purpose'];
        ksort($purposes);
        $this->assertSame(['admission enquiry' => 1, 'delivery' => 1, 'fee enquiry' => 1], $purposes);
        $this->assertNull($report['entries'][0]['photo_url'], 'no signed photo links in a report');
        $this->api('GET', $host, 'visitors/report', $admin, ['from' => '2026-01-01', 'to' => '2026-11-22'])->assertStatus(422);
        $this->assertSame(3, Tenancy::as($i, fn () => VisitorLog::count()), 'never deleted');

        // teachers out; staff keys
        $teacher = $this->makeUser($i, 'teacher');
        $this->api('GET', $host, 'visitors', $teacher)->assertForbidden();
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
        [$reader, $rd] = $staff('VisReader', ['staff.visitor.read']);
        [$gate, $gd] = $staff('VisGate', ['staff.visitor.manage']);
        $as($reader, $rd, 'GET', 'visitors')->assertOk();
        $as($reader, $rd, 'POST', 'visitors/check-in', ['visitor_name' => 'X', 'purpose' => 'Y'])->assertForbidden();
        $as($gate, $gd, 'POST', 'visitors/check-in', ['visitor_name' => 'X', 'purpose' => 'Y'])->assertCreated();
        $as($gate, $gd, 'PUT', "visitors/{$rahima['id']}", ['purpose' => 'Z'])->assertForbidden();

        // another institution, and coaching without the module
        $j = $this->makeInstitution('vis2', 'school');
        $this->api('PATCH', $this->hostOf($j), "visitors/{$rahima['id']}/check-out", $this->makeUser($j, 'admin'))->assertNotFound();
        $c = $this->makeInstitution('visc', 'coaching');
        $this->api('GET', $this->hostOf($c), 'visitors', $this->makeUser($c, 'admin'))->assertForbidden();

        // photos go after 90 days; the entry stays
        $this->travel(90)->days();
        $this->artisan('visitors:purge-photos')->assertSuccessful();
        Storage::disk('private')->assertMissing($path);
        $this->assertNull(Tenancy::as($i, fn () => VisitorLog::find($karim['id'])->photo));
        $this->assertSame('Karim Uddin', Tenancy::as($i, fn () => VisitorLog::find($karim['id'])->visitor_name));
    }
}
