<?php

namespace Tests\Feature\Academic;

use App\Models\{Batch, BatchTeacher, Enrollment, Institution, Program, Student, Subject, Teacher, User};
use App\Services\{StudentService, TeacherService};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

// Step 4.1 Done When: in a school, create/edit a class (program) and section (batch); assign the class teacher and subject
// teachers; the section's student list; /bootstrap carries the "শ্রেণি/শাখা" words. Plus the R1 routes' rules
// (academic-structure.md): nothing with members is deleted, a private batch's batch gets the default program.
class AcademicStructureApiTest extends TestCase
{
    use RefreshDatabase;

    private function school(): array
    {
        $i = $this->makeInstitution('acad', 'school');
        return [$i, $this->makeUser($i, 'admin'), $this->hostOf($i)];
    }

    public function test_a_school_builds_a_class_and_section_with_its_teachers_and_students(): void
    {
        Queue::fake();
        [$i, $admin, $host] = $this->school();

        $program = $this->api('POST', $host, 'programs', $admin, ['name' => 'Class 6', 'numeric_name' => 6])->assertCreated()->json('data');
        $this->api('PUT', $host, "programs/{$program['id']}", $admin, ['name' => 'Class Six'])->assertOk()->assertJsonPath('data.name', 'Class Six');
        $math = $this->api('POST', $host, 'subjects', $admin, ['program_id' => $program['id'], 'name' => 'Math', 'full_marks' => 100, 'pass_marks' => 33])->assertCreated()->json('data.id');
        $classTeacher = $this->api('POST', $host, 'teachers', $admin, ['name' => 'Karim', 'phone' => '01722220001'])->assertCreated()->json('data.id');
        $mathTeacher = $this->api('POST', $host, 'teachers', $admin, ['name' => 'Rahim', 'phone' => '01722220002'])->assertCreated()->json('data.id');

        $batch = $this->api('POST', $host, 'batches', $admin, ['program_id' => $program['id'], 'name' => 'A', 'teacher_id' => $classTeacher,
            'subject_teachers' => [['subject_id' => $math, 'teacher_id' => $mathTeacher]]])->assertCreated();
        $batch->assertJsonPath('data.teacher.name', 'Karim')->assertJsonPath('data.subject_teachers.0.teacher', 'Rahim')->assertJsonPath('data.subject_teachers.0.subject', 'Math');
        $batchId = $batch->json('data.id');
        $this->api('PUT', $host, "batches/{$batchId}", $admin, ['name' => 'A (morning)', 'shift' => 'morning'])->assertOk()
            ->assertJsonPath('data.name', 'A (morning)')->assertJsonPath('data.subject_teachers.0.teacher', 'Rahim');   // not sent = kept

        $student = Tenancy::as($i, fn () => app(StudentService::class)->create(['name' => 'Rafi', 'guardian_phone' => '01733330001'], Batch::find($batchId), ['roll_no' => 7]));
        $this->api('GET', $host, "batches/{$batchId}/students", $admin)->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'Rafi')->assertJsonPath('data.0.roll_no', 7);
        Tenancy::as($i, fn () => Enrollment::where('student_id', $student->id)->update(['status' => 'dropped']));
        $this->api('GET', $host, "batches/{$batchId}/students", $admin)->assertOk()->assertJsonCount(0, 'data');     // members = ACTIVE enrollments

        $this->api('GET', $host, 'bootstrap')->assertJsonPath('data.terms.program.bn', 'শ্রেণি')->assertJsonPath('data.terms.batch.bn', 'শাখা');
    }

    public function test_nothing_with_members_or_history_is_deleted(): void
    {
        Queue::fake();
        [$i, $admin, $host] = $this->school();
        [$program, $batch, $empty] = Tenancy::as($i, function () {
            $p = Program::create(['name' => 'Class 7']);
            return [$p, Batch::create(['program_id' => $p->id, 'name' => 'A']), Batch::create(['program_id' => $p->id, 'name' => 'B'])];
        });
        Tenancy::as($i, fn () => app(StudentService::class)->create(['name' => 'X', 'guardian_phone' => '01733330002'], $batch));
        Tenancy::as($i, fn () => Enrollment::query()->update(['status' => 'completed']));     // even a finished enrollment is history

        $this->api('DELETE', $host, "batches/{$batch->id}", $admin)->assertStatus(422)->assertJsonPath('error', 'in_use');
        $this->api('DELETE', $host, "programs/{$program->id}", $admin)->assertStatus(422)->assertJsonPath('error', 'in_use');
        $this->api('DELETE', $host, "batches/{$empty->id}", $admin)->assertOk();
        $this->assertNull(Tenancy::as($i, fn () => Batch::find($empty->id)));
        $this->api('PUT', $host, "batches/{$batch->id}", $admin, ['status' => 'archived'])->assertOk()->assertJsonPath('data.status', 'archived');
        $this->assertNotContains($batch->id, array_column($this->api('GET', $host, 'batches', $admin)->json('data'), 'id'), 'archived batches leave the default list');
        $this->assertContains($batch->id, array_column($this->api('GET', $host, 'batches?status=all', $admin)->json('data'), 'id'));

        $lonely = Tenancy::as($i, fn () => Program::create(['name' => 'Class 9']));
        $this->api('DELETE', $host, "programs/{$lonely->id}", $admin)->assertOk();
    }

    public function test_a_private_batch_hides_programs_and_gets_the_default_one(): void
    {
        $tutor = $this->makeInstitution('tutor', 'private_batch');
        $admin = $this->makeUser($tutor, 'admin');
        $host = $this->hostOf($tutor);
        $default = Tenancy::as($tutor, fn () => Program::where('is_default', true)->value('id') ?? Program::create(['name' => 'General', 'is_default' => true])->id);

        $this->api('POST', $host, 'batches', $admin, ['name' => 'Morning maths', 'monthly_fee' => 800,
            'schedule' => [['day' => 'sat', 'start' => '07:00', 'end' => '08:00']]])->assertCreated()->assertJsonPath('data.program_id', $default);
        $this->api('DELETE', $host, "programs/{$default}", $admin)->assertStatus(422)->assertJsonPath('error', 'in_use');
        // a private batch has no teacher role (institution_types.php)
        $this->api('POST', $host, 'teachers', $admin, ['name' => 'T', 'phone' => '01722220009'])->assertStatus(422)->assertJsonPath('error', 'role_not_available');

        [, $schoolAdmin, $schoolHost] = $this->school();
        $this->api('POST', $schoolHost, 'batches', $schoolAdmin, ['name' => 'No class'])->assertStatus(422)->assertJsonValidationErrors('program_id');
    }

    public function test_teachers_get_a_login_without_a_known_password_and_never_show_salary(): void
    {
        [$i, $admin, $host] = $this->school();
        $res = $this->api('POST', $host, 'teachers', $admin, ['name' => 'Selina', 'phone' => '+8801722220003', 'designation' => 'Assistant Teacher'])->assertCreated();
        $res->assertJsonPath('data.employee_id', 'T-0001')->assertJsonPath('data.phone', '01722220003');
        $this->assertArrayNotHasKey('salary', $res->json('data'));
        $user = User::find($res->json('data.user_id'));
        $this->assertSame(['teacher', true, $i->id], [$user->role, (bool) $user->must_change_password, $user->institution_id]);

        $this->api('POST', $host, 'teachers', $admin, ['name' => 'Dup', 'phone' => '01722220003'])->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->api('POST', $host, 'teachers', $admin, ['name' => 'Nobody'])->assertStatus(422)->assertJsonValidationErrors(['phone', 'email']);
        // the SPA sends every field, an empty one as null (found in the browser check: this was a 500)
        $this->api('POST', $host, 'teachers', $admin, ['name' => 'Second', 'email' => 'second@school.test', 'phone' => null, 'employee_id' => null,
            'designation' => null, 'joining_date' => null])->assertCreated()->assertJsonPath('data.employee_id', 'T-0002');

        $id = $res->json('data.id');
        $this->api('PUT', $host, "teachers/{$id}", $admin, ['name' => 'Selina Akter', 'phone' => '01722220003'])->assertOk()->assertJsonPath('data.name', 'Selina Akter');
        $this->api('DELETE', $host, "teachers/{$id}", $admin)->assertOk();
        $this->assertFalse((bool) $user->fresh()->is_active, 'a removed teacher cannot log in');
        $this->assertNotNull(Tenancy::as($i, fn () => Teacher::withTrashed()->find($id))->deleted_at, 'soft delete keeps the history');
        $this->assertNotContains($id, array_column($this->api('GET', $host, 'teachers', $admin)->json('data'), 'id'));
    }

    public function test_a_teacher_sees_their_own_batches_and_admin_only_routes_stay_closed(): void
    {
        [$i, $admin, $host] = $this->school();
        [$classT, $subjectT, $other] = Tenancy::as($i, fn () => [
            app(TeacherService::class)->create(['name' => 'C', 'phone' => '01722220004']),
            app(TeacherService::class)->create(['name' => 'S', 'phone' => '01722220005']),
            app(TeacherService::class)->create(['name' => 'O', 'phone' => '01722220006']),
        ]);
        Tenancy::as($i, function () use ($classT, $subjectT) {
            $p = Program::create(['name' => 'Class 8']);
            $math = Subject::create(['program_id' => $p->id, 'name' => 'Math']);
            Batch::create(['program_id' => $p->id, 'name' => 'A', 'teacher_id' => $classT->id]);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            BatchTeacher::create(['batch_id' => $b->id, 'teacher_id' => $subjectT->id, 'subject_id' => $math->id]);
            Batch::create(['program_id' => $p->id, 'name' => 'C']);
        });
        $as = fn (Teacher $t) => User::find($t->user_id)->forceFill(['must_change_password' => false]);
        $c = tap($as($classT))->save();
        $this->api('GET', $host, 'teacher/batches', $c)->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'A')->assertJsonPath('data.0.is_class_teacher', true);
        $s = tap($as($subjectT))->save();
        $this->api('GET', $host, 'teacher/batches', $s)->assertOk()->assertJsonPath('data.0.name', 'B')->assertJsonPath('data.0.is_class_teacher', false);
        $o = tap($as($other))->save();
        $this->api('GET', $host, 'teacher/batches', $o)->assertOk()->assertJsonCount(0, 'data');

        $this->api('GET', $host, 'programs', $c)->assertOk();                                   // read for admin and teacher
        $this->api('POST', $host, 'programs', $c, ['name' => 'Nope'])->assertForbidden();
        $this->api('GET', $host, 'teachers', $c)->assertForbidden();
        $this->api('GET', $host, 'teacher/batches', $admin)->assertForbidden();
    }

    public function test_subject_rules_and_subject_teachers_must_teach_this_programs_subject(): void
    {
        [$i, $admin, $host] = $this->school();
        [$p6, $p7, $t] = Tenancy::as($i, fn () => [Program::create(['name' => '6']), Program::create(['name' => '7']),
            app(TeacherService::class)->create(['name' => 'T', 'phone' => '01722220007'])]);
        $this->api('POST', $host, 'subjects', $admin, ['program_id' => $p6->id, 'name' => 'X', 'full_marks' => 50, 'pass_marks' => 60])
            ->assertStatus(422)->assertJsonValidationErrors('pass_marks');
        $bangla7 = $this->api('POST', $host, 'subjects', $admin, ['program_id' => $p7->id, 'name' => 'Bangla'])->assertCreated()->json('data.id');

        $this->api('POST', $host, 'batches', $admin, ['program_id' => $p6->id, 'name' => 'A',
            'subject_teachers' => [['subject_id' => $bangla7, 'teacher_id' => $t->id]]])->assertStatus(422)->assertJsonValidationErrors('subject_teachers.0.subject_id');
        $this->assertSame(0, Tenancy::as($i, fn () => Batch::count()), 'nothing is half-saved');
        $this->api('POST', $host, 'batches', $admin, ['program_id' => $p6->id, 'name' => 'A',
            'subject_teachers' => [['subject_id' => 0, 'teacher_id' => $t->id]]])->assertCreated()->assertJsonPath('data.subject_teachers.0.subject', null);

        $this->api('DELETE', $host, "subjects/{$bangla7}", $admin)->assertOk();
    }
}
