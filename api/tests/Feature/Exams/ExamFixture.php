<?php

namespace Tests\Feature\Exams;

use App\Models\{Batch, Institution, Program, Subject, Teacher, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\Queue;

// A school with Class 10 (two sections), two subjects - Bangla (Karim is its subject teacher) and Physics (70 written + 30 MCQ
// is set per exam) - and three students; Mine and Sister share a guardian phone, so one parent has two children.
trait ExamFixture
{
    protected function school(string $slug): array
    {
        Queue::fake();
        $i = $this->makeInstitution($slug, 'school');
        $d = Tenancy::as($i, function () use ($i) {
            $p = Program::create(['name' => 'Class 10']);
            $a = Batch::create(['program_id' => $p->id, 'name' => 'A']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'B']);
            $karimUser = $this->makeUser($i, 'teacher');
            $otherUser = User::create(['institution_id' => $i->id, 'name' => 'Other teacher', 'email' => 'other-teacher@example.test', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
            $karim = Teacher::create(['user_id' => $karimUser->id, 'employee_id' => 'T-K']);
            Teacher::create(['user_id' => $otherUser->id, 'employee_id' => 'T-O']);
            $bangla = Subject::create(['program_id' => $p->id, 'name' => 'বাংলা', 'teacher_id' => $karim->id, 'full_marks' => 100, 'pass_marks' => 33]);
            $physics = Subject::create(['program_id' => $p->id, 'name' => 'পদার্থবিজ্ঞান', 'full_marks' => 100, 'pass_marks' => 33]);
            $svc = app(StudentService::class);
            $mine = $svc->create(['name' => 'Mine', 'guardian_phone' => '01711000001'], $a, ['roll_no' => 1]);
            $sister = $svc->create(['name' => 'Sister', 'guardian_phone' => '01711000001'], $b, ['roll_no' => 1]);
            $other = $svc->create(['name' => 'Other', 'guardian_phone' => '01711000002'], $a, ['roll_no' => 2]);
            return compact('p', 'a', 'b', 'karimUser', 'otherUser', 'bangla', 'physics', 'mine', 'sister', 'other');
        });
        $d['parent'] = User::where('institution_id', $i->id)->where('phone', '01711000001')->first();
        $d['parent']->forceFill(['must_change_password' => false])->save();
        $d['admin'] = $this->makeUser($i, 'admin');
        return ['i' => $i, 'host' => $this->hostOf($i)] + $d;
    }

    /** An exam of Class 10 with Physics split 70 + 30 */
    protected function exam(array $s, string $name = 'Half yearly'): int
    {
        $id = $this->api('POST', $s['host'], 'exams', $s['admin'], ['name' => $name, 'program_id' => $s['p']->id, 'exam_type' => 'term', 'academic_year' => 2026])
            ->assertCreated()->json('data.id');
        $this->api('PUT', $s['host'], "exams/{$id}/subjects", $s['admin'], ['subjects' => [
            ['subject_id' => $s['bangla']->id, 'full_marks' => 100, 'pass_marks' => 33],
            ['subject_id' => $s['physics']->id, 'full_marks' => 100, 'pass_marks' => 33, 'components' => [
                ['key' => 'written', 'label' => 'লিখিত', 'full' => 70, 'pass' => 23], ['key' => 'mcq', 'label' => 'MCQ', 'full' => 30, 'pass' => 10]]],
        ]])->assertOk();
        return $id;
    }
}
