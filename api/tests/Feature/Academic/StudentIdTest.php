<?php

namespace Tests\Feature\Academic;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Student, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D160: a student ID is 10 digits - YYmmdd + the day's 4-digit serial shared by every institution; 9999 closes the day; old IDs with
// letters are converted once by the owner's command (dry run first), with the login name and the audit log following.
class StudentIdTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_serial_is_shared_by_every_institution_and_the_day_closes_at_9999(): void
    {
        $a = $this->makeInstitution('ida', 'school');
        $b = $this->makeInstitution('idb', 'school');
        $svc = app(StudentService::class);
        $first = Tenancy::as($a, fn () => $svc->create(['name' => 'A', 'guardian_phone' => '01711000011', 'admission_date' => '2026-03-05'])->student_id);
        $second = Tenancy::as($b, fn () => $svc->create(['name' => 'B', 'guardian_phone' => '01711000012', 'admission_date' => '2026-03-05'])->student_id);
        $other = Tenancy::as($b, fn () => $svc->create(['name' => 'C', 'guardian_phone' => '01711000013', 'admission_date' => '2026-03-06'])->student_id);
        $this->assertSame(['2603050001', '2603050002', '2603060001'], [$first, $second, $other]);

        Tenancy::as($a, fn () => Student::create(['student_id' => '2603079999', 'guardian_phone' => '01711000014']));
        try {
            Tenancy::as($a, fn () => $svc->generateStudentId('2026-03-07'));
            $this->fail('the 10000th ID of a day must be refused');
        } catch (BusinessException $e) {
            $this->assertSame('student_id_day_full', $e->errorCode);
        }
    }

    public function test_old_ids_with_letters_are_converted_once_with_login_and_audit(): void
    {
        $a = $this->makeInstitution('conva', 'school');
        $b = $this->makeInstitution('convb', 'school');
        $make = fn ($i, $code, $date) => Tenancy::as($i, function () use ($i, $code, $date) {
            $user = User::create(['institution_id' => $i->id, 'name' => $code, 'username' => $code, 'password' => 'Secret@1234', 'role' => 'student', 'is_active' => true]);
            return Student::create(['user_id' => $user->id, 'student_id' => $code, 'guardian_phone' => '01711000020', 'admission_date' => $date]);
        });
        $s1 = $make($a, 'CON-2025-0001', '2025-01-10');
        $s2 = $make($b, 'CON-2025-0001', '2025-01-10');                  // the same old code in another institution
        $keep = Tenancy::as($a, fn () => Student::create(['student_id' => '2501100005', 'guardian_phone' => '01711000021']));

        $this->artisan('students:numeric-ids', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame('CON-2025-0001', Tenancy::as($a, fn () => $s1->fresh()->student_id), 'a dry run saves nothing');

        $this->artisan('students:numeric-ids')->assertFailed();          // saving needs the Super Admin who runs it
        $super = User::create(['institution_id' => null, 'name' => 'Owner', 'role' => 'super_admin', 'phone' => '01700000077', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $this->artisan('students:numeric-ids', ['--by' => '01700000077'])->assertSuccessful();
        $new1 = Tenancy::as($a, fn () => $s1->fresh()->student_id);
        $new2 = Tenancy::as($b, fn () => $s2->fresh()->student_id);
        $this->assertSame(['2501100006', '2501100007'], [$new1, $new2], 'after the day\'s highest serial, unique across institutions');
        $this->assertSame('2501100005', Tenancy::as($a, fn () => $keep->fresh()->student_id), 'a 10-digit ID never changes');
        $this->assertSame($new1, User::find($s1->user_id)->username, 'the login name follows the ID');
        $this->assertSame([$super->id], Tenancy::as($a, fn () => AuditLog::where('action', 'student.id_converted')->pluck('user_id')->all()));
        $this->artisan('students:numeric-ids', ['--by' => (string) $super->id])->assertSuccessful();
        $this->assertSame($new1, Tenancy::as($a, fn () => $s1->fresh()->student_id), 'a second run changes nothing');
    }
}
