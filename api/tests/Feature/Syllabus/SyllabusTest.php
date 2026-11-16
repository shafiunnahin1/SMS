<?php

namespace Tests\Feature\Syllabus;

use App\Models\{AuditLog, Batch, BatchTeacher, LessonPlan, Program, Subject, SyllabusCoverage, SyllabusUnit, Teacher, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D224 SYL.1 (docs/modules/syllabus.md section 4): coverage maths (leaves only, parents derived, 0 units = 0.00), one coverage per
// batch and unit (untick audited), taught covers once / skipped not, the behind list, a teacher only on their own batch and subject,
// another institution 404. Done When: 20 units, 12 ticked = 60.00.
class SyllabusTest extends TestCase
{
    use RefreshDatabase;

    private function school(string $slug): array
    {
        $this->travelTo('2026-11-10 10:00:00');
        $i = $this->makeInstitution($slug, 'school');
        $admin = $this->makeUser($i, 'admin');
        $teacherUser = $this->makeUser($i, 'teacher');
        $d = Tenancy::as($i, function () use ($teacherUser) {
            $p = Program::create(['name' => 'Class 6']);
            $math = Subject::create(['program_id' => $p->id, 'name' => 'Math']);
            $sci = Subject::create(['program_id' => $p->id, 'name' => 'Science']);
            $a = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            $t = Teacher::where('user_id', $teacherUser->id)->first() ?? Teacher::create(['user_id' => $teacherUser->id, 'employee_id' => 'T-1', 'status' => 'active']);
            BatchTeacher::create(['batch_id' => $a->id, 'teacher_id' => $t->id, 'subject_id' => $math->id]);
            return compact('p', 'math', 'sci', 'a', 'b', 't');
        });
        return [$i, $admin, $teacherUser, $d, $this->hostOf($i)];
    }

    /** 4 chapters x 5 lessons = 20 leaves */
    private function tree($host, User $admin, array $d): array
    {
        $leaves = [];
        foreach (range(1, 4) as $c) {
            $ch = $this->api('POST', $host, 'syllabus/units', $admin, ['program_id' => $d['p']->id, 'subject_id' => $d['math']->id, 'title' => "অধ্যায় {$c}", 'term' => '১ম সাময়িক'])->assertCreated()->json('data.id');
            foreach (range(1, 5) as $l) $leaves[] = $this->api('POST', $host, 'syllabus/units', $admin, ['program_id' => $d['p']->id, 'subject_id' => $d['math']->id, 'parent_id' => $ch, 'title' => "পাঠ {$c}.{$l}"])->assertCreated()->json('data.id');
        }
        return $leaves;
    }

    public function test_coverage_counts_leaves_only_and_twelve_of_twenty_is_sixty_percent(): void
    {
        [$i, $admin, $teacher, $d, $host] = $this->school('sylmath');
        $q = ['batch_id' => $d['a']->id, 'subject_id' => $d['math']->id];
        $this->assertSame('0.00', $this->api('GET', $host, 'syllabus/coverage', $teacher, $q)->assertOk()->json('data.percent'), 'no units = 0.00, not a division by zero');
        $leaves = $this->tree($host, $admin, $d);
        foreach (array_slice($leaves, 0, 12) as $u) $this->api('POST', $host, 'syllabus/coverage', $teacher, ['batch_id' => $d['a']->id, 'unit_id' => $u])->assertCreated();
        $c = $this->api('GET', $host, 'syllabus/coverage', $teacher, $q)->assertOk()->json('data');
        $this->assertSame(['60.00', 12, 20], [$c['percent'], $c['covered'], $c['leaves']]);
        $this->assertSame([true, true, false, false], array_column($c['tree'], 'covered'), 'a chapter is covered when all its lessons are (derived)');
        $parent = $c['tree'][0]['id'];
        $this->api('POST', $host, 'syllabus/coverage', $teacher, ['batch_id' => $d['a']->id, 'unit_id' => $parent])->assertStatus(422)->assertJsonValidationErrors('unit_id');
        $this->assertSame('0.00', $this->api('GET', $host, 'syllabus/coverage', $admin, ['batch_id' => $d['b']->id, 'subject_id' => $d['math']->id])->json('data.percent'), 'per batch');
    }

    public function test_a_unit_is_covered_once_per_batch_and_an_untick_is_audited(): void
    {
        [$i, $admin, $teacher, $d, $host] = $this->school('syluniq');
        $u = $this->tree($host, $admin, $d)[0];
        $body = ['batch_id' => $d['a']->id, 'unit_id' => $u];
        $this->api('POST', $host, 'syllabus/coverage', $teacher, $body)->assertCreated();
        $this->api('POST', $host, 'syllabus/coverage', $teacher, $body)->assertCreated();
        $this->assertSame(1, Tenancy::as($i, fn () => SyllabusCoverage::count()));
        $this->api('DELETE', $host, 'syllabus/coverage', $teacher, $body)->assertOk();
        $this->assertSame(0, Tenancy::as($i, fn () => SyllabusCoverage::count()));
        $this->assertSame(1, Tenancy::as($i, fn () => AuditLog::where('action', 'syllabus.uncovered')->count()));
        $this->api('POST', $host, 'syllabus/coverage', $admin, $body)->assertCreated();          // the admin's tick goes to the batch's teacher
        $this->assertSame($d['t']->id, Tenancy::as($i, fn () => (int) SyllabusCoverage::value('teacher_id')));
        $this->api('DELETE', $host, "syllabus/units/{$u}", $admin)->assertStatus(409)->assertJsonPath('error', 'unit_in_use');
    }

    public function test_taught_covers_once_skipped_does_not_and_the_behind_list(): void
    {
        [$i, $admin, $teacher, $d, $host] = $this->school('sylplan');
        [$u1, $u2, $u3] = array_slice($this->tree($host, $admin, $d), 0, 3);
        $plan = fn ($u, $date) => $this->api('POST', $host, 'lesson-plans', $teacher, ['batch_id' => $d['a']->id, 'subject_id' => $d['math']->id, 'unit_id' => $u, 'planned_date' => $date, 'objective' => 'ভগ্নাংশ'])->assertCreated()->json('data.id');
        $p1 = $plan($u1, '2026-11-05');
        $p2 = $plan($u2, '2026-11-08');
        $plan($u3, '2026-11-20');                                                               // in the future: not behind
        $this->assertEqualsCanonicalizing([$u1, $u2], array_column(array_column($this->api('GET', $host, 'syllabus/behind', $teacher)->assertOk()->json('data'), 'unit'), 'id'));
        $this->api('POST', $host, "lesson-plans/{$p1}/taught", $teacher)->assertOk()->assertJsonPath('data.status', 'taught');
        $this->api('POST', $host, "lesson-plans/{$p1}/taught", $teacher)->assertStatus(409);
        $this->api('POST', $host, "lesson-plans/{$p2}/skipped", $teacher)->assertOk();
        $this->assertSame([$u1], Tenancy::as($i, fn () => SyllabusCoverage::pluck('unit_id')->all()), 'taught covers, skipped does not');
        $this->assertSame([$u2], array_column(array_column($this->api('GET', $host, 'syllabus/behind', $admin)->json('data'), 'unit'), 'id'), 'skipped and not covered is still behind');
        $this->api('POST', $host, 'syllabus/coverage', $teacher, ['batch_id' => $d['a']->id, 'unit_id' => $u2])->assertCreated();
        $this->assertSame([], $this->api('GET', $host, 'syllabus/behind', $teacher)->json('data'), 'covered = no longer behind');
        $this->api('PUT', $host, "lesson-plans/{$p1}", $teacher, ['objective' => 'x'])->assertStatus(409);
    }

    public function test_a_teacher_works_only_on_their_batch_and_subject_and_another_institution_gets_404(): void
    {
        [$i, $admin, $teacher, $d, $host] = $this->school('sylacc');
        $u = $this->tree($host, $admin, $d)[0];
        $this->api('POST', $host, 'syllabus/units', $teacher, ['program_id' => $d['p']->id, 'subject_id' => $d['math']->id, 'title' => 'x'])->assertForbidden();
        $this->api('GET', $host, 'syllabus/coverage', $teacher, ['batch_id' => $d['b']->id, 'subject_id' => $d['math']->id])->assertForbidden();
        $this->api('GET', $host, 'syllabus/coverage', $teacher, ['batch_id' => $d['a']->id, 'subject_id' => $d['sci']->id])->assertForbidden();
        $this->api('POST', $host, 'syllabus/coverage', $teacher, ['batch_id' => $d['b']->id, 'unit_id' => $u])->assertForbidden();
        $this->api('POST', $host, 'lesson-plans', $teacher, ['batch_id' => $d['b']->id, 'subject_id' => $d['math']->id, 'planned_date' => '2026-11-12'])->assertForbidden();
        $mine = $this->api('POST', $host, 'lesson-plans', $teacher, ['batch_id' => $d['a']->id, 'subject_id' => $d['math']->id, 'planned_date' => '2026-11-12'])->assertCreated()->json('data.id');
        $this->assertSame([[$d['a']->id, 'Math']], array_map(fn ($r) => [$r['batch_id'], $r['subject']], $this->api('GET', $host, 'lesson-plans/assignments', $teacher)->assertOk()->json('data')), 'SYL.3: the teacher sees what they teach');
        $this->api('GET', $host, 'syllabus/coverage', $this->makeUser($i, 'parent'), ['batch_id' => $d['a']->id, 'subject_id' => $d['math']->id])->assertForbidden();

        [$j, $otherAdmin, , , $otherHost] = $this->school('sylacc2');
        $this->api('PUT', $otherHost, "syllabus/units/{$u}", $otherAdmin, ['title' => 'x'])->assertNotFound();
        $this->api('POST', $otherHost, "lesson-plans/{$mine}/taught", $otherAdmin)->assertNotFound();
        $this->api('POST', $otherHost, 'syllabus/coverage', $otherAdmin, ['batch_id' => $d['a']->id, 'unit_id' => $u])->assertNotFound();
        $this->assertSame([], $this->api('GET', $otherHost, 'lesson-plans', $otherAdmin)->json('data'));
    }

    /** D225: department staff with one exact key each */
    public function test_department_staff_work_lesson_plans_with_their_exact_keys(): void
    {
        [$i, $admin, $teacher, $d, $host] = $this->school('sylstaff');
        $i->forceFill(['staff_department_mode' => 'department'])->save();
        $staff = function (string $name, array $keys) use ($i, $admin) {
            $u = User::create(['institution_id' => $i->id, 'name' => $name, 'email' => strtolower($name) . '@example.test', 'password' => 'Secret@1234', 'role' => 'institution_staff', 'is_active' => true]);
            $u->forceFill(['must_change_password' => false])->save();
            $dep = Tenancy::as($i, function () use ($u, $name, $keys, $admin) {
                $svc = app(\App\Services\DepartmentService::class);
                $dep = $svc->create($admin, ['name' => "Dept {$name}"]);
                $m = $svc->addMember($admin, $dep->id, ['user_id' => $u->id]);
                $duty = $svc->createDuty($admin, $dep->id, ['code' => strtoupper($name), 'name' => $name, 'permission_keys' => $keys]);
                $svc->assignDuties($admin, $m->id, ['duty_ids' => [$duty->id]]);
                return $dep->id;
            });
            return [$u, $dep];
        };
        $as = function (User $u, ?int $dep, string $method, string $path, array $body = []) use ($host) {
            $this->app['auth']->forgetGuards();
            return $this->json($method, "http://{$host}/api/v1/{$path}", $body, ['Authorization' => 'Bearer ' . $u->createToken('t')->plainTextToken] + ($dep ? ['X-Department-Id' => (string) $dep] : []));
        };
        $u = $this->tree($host, $admin, $d)[0];
        [$writer, $wd] = $staff('Writer', ['staff.lesson_plan.read', 'staff.lesson_plan.create', 'staff.lesson_plan.update']);
        [$reader, $rd] = $staff('Reader', ['staff.lesson_plan.read']);
        [$marker, $md] = $staff('Marker', ['staff.lesson_plan.mark', 'staff.lesson_plan.delete']);
        $body = ['batch_id' => $d['a']->id, 'subject_id' => $d['math']->id, 'unit_id' => $u, 'planned_date' => '2026-11-12'];

        $as($writer, null, 'POST', 'lesson-plans', $body + ['teacher_id' => $d['t']->id])->assertForbidden();               // no department chosen
        $as($writer, $wd, 'POST', 'lesson-plans', $body)->assertStatus(422)->assertJsonValidationErrors('teacher_id');       // names a teacher of that subject
        $plan = $as($writer, $wd, 'POST', 'lesson-plans', $body + ['teacher_id' => $d['t']->id])->assertCreated()->json('data.id');
        $as($writer, $wd, 'PUT', "lesson-plans/{$plan}", ['objective' => 'ভগ্নাংশ'])->assertOk();
        $as($writer, $wd, 'POST', "lesson-plans/{$plan}/taught")->assertForbidden();                                          // mark is another key
        $as($reader, $rd, 'POST', 'lesson-plans', $body + ['teacher_id' => $d['t']->id])->assertForbidden();
        $this->assertCount(1, $as($reader, $rd, 'GET', 'lesson-plans')->assertOk()->json('data'), 'staff see every batch');
        $this->assertCount(1, $as($reader, $rd, 'GET', 'lesson-plans/assignments')->assertOk()->json('data'), 'SYL.3: staff pickers (read key)');
        $as($marker, $md, 'GET', 'lesson-plans/assignments')->assertForbidden();
        $as($reader, $wd, 'GET', 'lesson-plans')->assertForbidden();                                                          // not their department
        $as($marker, $md, 'POST', "lesson-plans/{$plan}/taught")->assertOk();
        $as($marker, $md, 'DELETE', "lesson-plans/{$plan}")->assertStatus(409);                                              // taught: final for everyone
        $this->assertSame([$u], Tenancy::as($i, fn () => SyllabusCoverage::pluck('unit_id')->all()));
        $as($writer, $wd, 'GET', 'syllabus/coverage', ['batch_id' => $d['a']->id, 'subject_id' => $d['math']->id])->assertForbidden();   // only lesson plans are staff work
    }
}
