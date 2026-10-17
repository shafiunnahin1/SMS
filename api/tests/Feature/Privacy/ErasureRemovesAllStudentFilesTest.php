<?php

namespace Tests\Feature\Privacy;

use App\Models\{Attendance, AuditLog, Batch, Consent, FeeCategory, FeePayment, ImportJob, ImportRow, Program, Student, User};
use App\Services\{ConsentService, FeeService, StudentService};
use App\Support\{StudentFiles, Tenancy};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Tests\TestCase;

// Step 8.1 (D27, docs/legal/privacy-and-consent.md section 5): anonymizing a student leaves no name, phone, photo or other file,
// no login and no parent link - but the fee, attendance and result rows stay. A parent exports their own child's data only.
class ErasureRemovesAllStudentFilesTest extends TestCase
{
    use RefreshDatabase;

    private function setupStudents(): array
    {
        Storage::fake('private');
        $i = $this->makeInstitution('erase', 'coaching');
        $admin = $this->makeUser($i, 'admin');
        [$rahim, $karim, $other] = Tenancy::as($i, function () use ($i) {
            $batch = Batch::create(['program_id' => Program::create(['name' => 'P'])->id, 'name' => 'B']);
            FeeCategory::create(['name' => 'Tuition', 'amount' => 500, 'frequency' => 'monthly']);
            $svc = app(StudentService::class);
            $rahim = $svc->create(['name' => 'Rahim Uddin', 'guardian_phone' => '01711112222', 'father_name' => 'Abdul', 'address' => 'Dhaka'], $batch);
            $karim = $svc->create(['name' => 'Karim', 'guardian_phone' => '01733334444'], $batch);              // another family
            $sister = $svc->create(['name' => 'Rina', 'guardian_phone' => '01733334444'], $batch);              // Karim's sister, same parent
            return [$rahim->fresh(), $karim->fresh(), $sister->fresh()];
        });
        return [$i, $admin, $rahim, $karim, $other];
    }

    public function test_anonymizing_removes_every_file_and_personal_field_and_keeps_the_records(): void
    {
        [$i, $admin, $rahim] = $this->setupStudents();
        Tenancy::as($i, function () use ($rahim, $admin) {
            $rahim->forceFill(['photo' => StudentFiles::storePhoto($rahim, UploadedFile::fake()->image('p.jpg'))])->save();
            Storage::disk('private')->put(StudentFiles::dir($rahim) . '/documents/birth-cert.pdf', 'pdf');         // any later file of the student
            $this->actingAs($admin);
            app(ConsentService::class)->record($rahim, 'photo', 'paper', ['guardian_name' => 'Abdul'], $admin->id);
            $fees = app(FeeService::class);
            $fees->collect($rahim, [['key' => $fees->dueLines($rahim)->first()['key']]]);
            Attendance::create(['student_id' => $rahim->id, 'batch_id' => $rahim->batch_id, 'program_id' => $rahim->program_id, 'date' => now()->toDateString(), 'status' => 'present']);
            $job = ImportJob::create(['kind' => 'students', 'status' => 'done', 'file_path' => 'x', 'created_by' => $admin->id]);
            ImportRow::create(['job_id' => $job->id, 'row_no' => 2, 'status' => 'ok', 'data' => ['name' => 'Rahim Uddin', 'phone' => '01711112222'],
                'created_table' => 'students', 'created_id' => $rahim->id]);
        });
        $parent = Tenancy::as($i, fn () => $rahim->parents()->first());
        $studentUser = $rahim->user;
        $studentUser->createToken('t');
        $parent->createToken('t');
        $this->assertNotEmpty(Storage::disk('private')->allFiles(StudentFiles::dir($rahim)));

        $host = $this->hostOf($i);
        $this->api('POST', $host, "students/{$rahim->id}/anonymize", $admin, ['confirm_name' => 'Rahim'])->assertStatus(422)->assertJsonPath('error', 'confirm_name_mismatch');
        $this->api('POST', $host, "students/{$rahim->id}/anonymize", $this->makeUser($i, 'teacher'), ['confirm_name' => 'Rahim Uddin'])->assertForbidden();
        $this->api('POST', $host, "students/{$rahim->id}/anonymize", $admin, ['confirm_name' => 'Rahim Uddin'])->assertOk();

        $this->assertSame([], Storage::disk('private')->allFiles(StudentFiles::dir($rahim)), 'photo and every other file of the student are gone');
        $s = Tenancy::as($i, fn () => Student::find($rahim->id));
        $this->assertSame([null, null, null, null, '00000000000', 'inactive'], [$s->photo, $s->father_name, $s->address, $s->date_of_birth, $s->guardian_phone, $s->status]);
        $this->assertNotNull($s->anonymized_at);
        $u = $studentUser->fresh();
        $this->assertSame(['Anonymized #' . $rahim->id, null, false, 0], [$u->name, $u->phone, (bool) $u->is_active, $u->tokens()->count()]);
        $p = $parent->fresh();
        $this->assertSame(['Anonymized parent #' . $parent->id, null, false, 0], [$p->name, $p->phone, (bool) $p->is_active, $p->tokens()->count()], 'no other child: the parent goes too');
        $this->assertSame(0, DB::table('parent_student')->where('student_id', $rahim->id)->count());
        Tenancy::as($i, function () use ($rahim) {
            $this->assertSame(0, Consent::where('student_id', $rahim->id)->count());
            $this->assertNull(ImportRow::where('created_id', $rahim->id)->value('data'), 'the raw spreadsheet row is blanked');
            $this->assertSame([1, 1], [FeePayment::where('student_id', $rahim->id)->count(), Attendance::where('student_id', $rahim->id)->count()], 'money and attendance stay (D32)');
            $this->assertSame(1, AuditLog::where('action', 'student.anonymized')->count());
            $this->assertStringNotContainsString('Rahim', json_encode(AuditLog::where('action', 'student.anonymized')->first()->new_data));
        });
        $this->api('POST', $host, "students/{$rahim->id}/anonymize", $admin, ['confirm_name' => 'Anonymized #' . $rahim->id])->assertStatus(422)->assertJsonPath('error', 'already_anonymized');
    }

    public function test_a_parent_with_another_child_keeps_the_account(): void
    {
        [$i, $admin, , $karim, $sister] = $this->setupStudents();
        $parent = Tenancy::as($i, fn () => $karim->parents()->first());
        $this->assertSame($parent->id, Tenancy::as($i, fn () => $sister->parents()->first()->id));
        $this->api('POST', $this->hostOf($i), "students/{$karim->id}/anonymize", $admin, ['confirm_name' => 'Karim'])->assertOk();
        $this->assertSame([true, '01733334444'], [(bool) $parent->fresh()->is_active, $parent->fresh()->phone]);
        $this->assertSame([$sister->id], DB::table('parent_student')->where('parent_user_id', $parent->id)->pluck('student_id')->map(fn ($v) => (int) $v)->all());
    }

    public function test_a_parent_exports_only_their_own_child(): void
    {
        [$i, $admin, $rahim, $karim] = $this->setupStudents();
        $parent = Tenancy::as($i, fn () => $rahim->parents()->first());
        $parent->forceFill(['must_change_password' => false])->save();           // a parent account made at admission must set a password first
        $host = $this->hostOf($i);
        $res = $this->api('GET', $host, "parent/children/{$rahim->id}/export", $parent)->assertOk();
        $this->assertSame(['Rahim Uddin', 'Abdul', '01711112222'], [$res->json('data.student.name'), $res->json('data.student.father_name'), $res->json('data.student.guardian_phone')]);
        $this->assertSame(['student', 'enrollments', 'attendance', 'results', 'fee_payments', 'dues', 'consents'],
            array_values(array_intersect(array_keys($res->json('data')), ['student', 'enrollments', 'attendance', 'results', 'fee_payments', 'dues', 'consents'])));
        $this->assertStringContainsString('attachment', $res->headers->get('Content-Disposition'));
        $this->assertSame(1, Tenancy::as($i, fn () => AuditLog::where('action', 'student.exported')->count()), 'the export is audited');

        $this->api('GET', $host, "parent/children/{$karim->id}/export", $parent)->assertNotFound();
        $this->api('GET', $host, "parent/children/{$rahim->id}/export", $admin)->assertForbidden();
    }
}
