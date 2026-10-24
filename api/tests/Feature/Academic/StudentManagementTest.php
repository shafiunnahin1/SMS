<?php

namespace Tests\Feature\Academic;

use App\Models\{Batch, Enrollment, ParentStudent, Program, Student, User};
use App\Services\StudentService;
use App\Support\{StudentFiles, Tenancy};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Queue, Storage};
use Tests\TestCase;

// Step 4.2 Done When: student CRUD with the auto ID and the parent from the guardian phone; a second active enrollment in a school
// is a 422; a coaching student joins two batches; deleting a student removes every file of that student (photo included).
class StudentManagementTest extends TestCase
{
    use RefreshDatabase;

    private function setUpType(string $type): array
    {
        Queue::fake();
        Storage::fake('private');
        $i = $this->makeInstitution("sm{$type}", $type);
        [$a, $b] = Tenancy::as($i, function () {
            $p = Program::create(['name' => 'P']);
            return [Batch::create(['program_id' => $p->id, 'name' => 'A']), Batch::create(['program_id' => $p->id, 'name' => 'B'])];
        });
        return [$i, $this->makeUser($i, 'admin'), $this->hostOf($i), $a, $b];
    }

    public function test_admission_with_photo_and_paper_consent_then_edit_and_a_new_guardian(): void
    {
        [$i, $admin, $host, $a] = $this->setUpType('school');
        $res = $this->api('POST', $host, 'students', $admin, ['name' => 'Rafi', 'guardian_phone' => '01711110001', 'batch_id' => $a->id,
            'photo' => UploadedFile::fake()->image('../../evil.php.jpg', 200, 200), 'consent_data' => true, 'consent_sms' => true, 'father_name' => 'Karim'])->assertCreated();
        $id = $res->json('data.id');
        $this->assertMatchesRegularExpression('/^\d{6}0001$/', $res->json('data.student_id'), 'auto student ID: YYmmdd + the day\'s first global serial (D160)');
        $student = Tenancy::as($i, fn () => Student::find($id));
        $this->assertMatchesRegularExpression("#^institutions/{$i->id}/students/{$id}/photo-[0-9a-f-]{36}\\.jpg$#", $student->photo, 'UUID name under the student folder');
        Storage::disk('private')->assertExists($student->photo);
        $this->assertNotNull($res->json('data.photo_url'));
        $this->assertSame(['granted', 'granted'], [
            $this->api('GET', $host, "students/{$id}/consents", $admin)->json('data.0.status'), $this->api('GET', $host, "students/{$id}/consents", $admin)->json('data.1.status')]);

        $old = Tenancy::as($i, fn () => ParentStudent::where('student_id', $id)->value('parent_user_id'));
        $this->api('PUT', $host, "students/{$id}", $admin, ['name' => 'Rafiul', 'guardian_phone' => '01711110002', 'address' => 'Dhaka'])->assertOk()
            ->assertJsonPath('data.name', 'Rafiul')->assertJsonPath('data.address', 'Dhaka');
        $links = Tenancy::as($i, fn () => ParentStudent::where('student_id', $id)->pluck('parent_user_id')->all());
        $this->assertNotContains($old, $links, 'the old guardian no longer sees the child');
        $this->assertSame('01711110002', User::find($links[0])->phone);
        $this->api('PUT', $host, "students/{$id}", $admin, ['program_id' => 99])->assertOk();    // cache fields are not editable here
        $this->assertSame($a->id, Tenancy::as($i, fn () => Student::find($id)->batch_id));
    }

    public function test_one_active_enrollment_in_a_school_two_batches_in_a_coaching_and_the_enrollment_actions(): void
    {
        [$i, $admin, $host, $a, $b] = $this->setUpType('school');
        $sid = $this->api('POST', $host, 'students', $admin, ['name' => 'S', 'guardian_phone' => '01711110003', 'batch_id' => $a->id])->json('data.id');
        $this->api('POST', $host, 'enrollments', $admin, ['student_id' => $sid, 'batch_id' => $b->id])->assertStatus(422);

        $eid = $this->api('GET', $host, "students/{$sid}/enrollments", $admin)->assertOk()->json('data.0.id');
        $this->api('PUT', $host, "enrollments/{$eid}", $admin, ['roll_no' => 12])->assertOk()->assertJsonPath('data.roll_no', 12);
        $this->assertSame(12, Tenancy::as($i, fn () => Student::find($sid)->roll_no), 'the primary enrollment refreshes the cache');
        $new = $this->api('POST', $host, "enrollments/{$eid}/transfer", $admin, ['batch_id' => $b->id])->assertCreated()->json('data');
        $this->assertSame($b->id, Tenancy::as($i, fn () => Student::find($sid)->batch_id));
        $this->api('POST', $host, "enrollments/{$eid}/end", $admin, ['status' => 'dropped'])->assertStatus(422)->assertJsonPath('error', 'enrollment_not_active');
        $this->api('POST', $host, "enrollments/{$new['id']}/end", $admin, ['status' => 'completed'])->assertOk()->assertJsonPath('data.status', 'completed');
        $this->assertNull(Tenancy::as($i, fn () => Student::find($sid)->batch_id), 'no active enrollment = empty cache');
        $this->assertCount(2, $this->api('GET', $host, "students/{$sid}/enrollments", $admin)->json('data'), 'history kept');

        [, $cAdmin, $cHost, $ca, $cb] = $this->setUpType('coaching');
        $cs = $this->api('POST', $cHost, 'students', $cAdmin, ['name' => 'C', 'guardian_phone' => '01711110004', 'batch_id' => $ca->id])->json('data.id');
        $this->api('POST', $cHost, 'enrollments', $cAdmin, ['student_id' => $cs, 'batch_id' => $cb->id])->assertCreated();
        $this->assertCount(2, $this->api('GET', $cHost, "students/{$cs}", $cAdmin)->json('data.enrollments'));
    }

    public function test_deleting_a_student_removes_all_their_files_and_switches_off_the_login(): void
    {
        [$i, $admin, $host, $a] = $this->setUpType('school');
        $id = $this->api('POST', $host, 'students', $admin, ['name' => 'D', 'guardian_phone' => '01711110005', 'batch_id' => $a->id,
            'photo' => UploadedFile::fake()->image('p.png')])->json('data.id');
        $student = Tenancy::as($i, fn () => Student::find($id));
        Storage::disk('private')->put(StudentFiles::dir($student) . '/documents/x.pdf', 'doc');          // any other student file
        $other = Tenancy::as($i, fn () => app(StudentService::class)->create(['name' => 'Keep', 'guardian_phone' => '01711110006'], $a));
        Storage::disk('private')->put(StudentFiles::dir($other) . '/photo-keep.jpg', 'x');

        $this->api('DELETE', $host, "students/{$id}", $admin)->assertOk();
        $this->assertSame([], Storage::disk('private')->allFiles(StudentFiles::dir($student)), 'photo and documents are gone');
        Storage::disk('private')->assertExists(StudentFiles::dir($other) . '/photo-keep.jpg');
        $this->assertFalse((bool) User::find($student->user_id)->is_active);
        $this->assertSame('dropped', Tenancy::as($i, fn () => Enrollment::where('student_id', $id)->value('status')));
        $this->api('GET', $host, "students/{$id}", $admin)->assertNotFound();
        $this->assertNotNull(Tenancy::as($i, fn () => Student::withTrashed()->find($id))->deleted_at, 'soft delete: fee/attendance history keeps its student');
    }
}
