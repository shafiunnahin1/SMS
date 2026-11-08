<?php

namespace Tests\Feature\Student;

use App\Models\{Attendance, Exam, FeeCategory, Result, Student, User};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// D195 STP.1: the student portal reads only the signed-in student's own data - dashboard, published results, dues and receipts,
// the month's attendance; another student's rows never show, an unpublished exam stays hidden, other roles are refused.
class StudentPortalTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    public function test_a_student_sees_only_their_own_data(): void
    {
        $s = $this->school('stp');
        [$mineU, $sisterU] = Tenancy::as($s['i'], function () use ($s) {
            $u = [];
            foreach (['mine' => 'STP-1', 'sister' => 'STP-2'] as $k => $name) {
                $u[$k] = User::create(['institution_id' => $s['i']->id, 'name' => ucfirst($k), 'username' => $name, 'role' => 'student', 'password' => 'Student-pass-26', 'is_active' => true]);
                Student::whereKey($s[$k]->id)->update(['user_id' => $u[$k]->id]);
            }
            FeeCategory::create(['name' => 'Tuition', 'amount' => '500.00', 'frequency' => 'monthly', 'applicable_to' => 'all']);
            Attendance::create(['student_id' => $s['mine']->id, 'program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'date' => now()->toDateString(), 'status' => 'present']);
            Attendance::create(['student_id' => $s['sister']->id, 'program_id' => $s['p']->id, 'batch_id' => $s['b']->id, 'date' => now()->toDateString(), 'status' => 'absent']);
            return [$u['mine'], $u['sister']];
        });
        $published = $this->exam($s, 'Half yearly');
        $draft = $this->exam($s, 'Draft test');
        Tenancy::as($s['i'], function () use ($s, $published, $draft) {
            foreach ([$published, $draft] as $e) Result::create(['exam_id' => $e, 'student_id' => $s['mine']->id, 'subject_id' => $s['bangla']->id, 'marks_obtained' => 80]);
            Result::create(['exam_id' => $published, 'student_id' => $s['sister']->id, 'subject_id' => $s['bangla']->id, 'marks_obtained' => 40]);
            Exam::whereKey($published)->update(['status' => 'published']);
        });
        $lines = $this->api('GET', $s['host'], "fees/dues?student_id={$s['mine']->id}", $s['admin'])->json('data.lines');
        $this->api('POST', $s['host'], 'fees/collect', $s['admin'], ['student_id' => $s['mine']->id, 'payment_method' => 'cash', 'lines' => [['key' => $lines[0]['key']]]])->assertCreated();

        $dash = $this->api('GET', $s['host'], 'student/dashboard', $mineU)->assertOk()->json('data');
        $this->assertSame([$s['mine']->id, 1, 100.0, 'Half yearly'], [$dash['id'], $dash['attendance']['days'], (float) $dash['attendance']['percentage'], $dash['latest_result']['exam']]);

        $results = $this->api('GET', $s['host'], 'student/results', $mineU)->assertOk()->json('data');
        $this->assertSame([$s['mine']->id], [$results['student']['id']]);
        $this->assertSame(['Half yearly'], array_column(array_column($results['exams'], 'exam'), 'name'), 'only published exams');

        $fees = $this->api('GET', $s['host'], 'student/fees', $mineU)->assertOk()->json('data');
        $this->assertCount(1, $fees['receipts']);
        $this->assertSame([], $this->api('GET', $s['host'], 'student/fees', $sisterU)->json('data.receipts'), 'the sister paid nothing');

        $att = $this->api('GET', $s['host'], 'student/attendance', $sisterU)->assertOk()->json('data');
        $this->assertSame($s['sister']->id, $att['student']['id']);
        $this->assertSame(['absent'], array_column($att['daily_records'], 'status'));

        foreach (['dashboard', 'results', 'fees', 'attendance'] as $p) {
            $this->api('GET', $s['host'], "student/$p?student_id={$s['sister']->id}", $mineU)->assertOk();   // a request id changes nothing
            $this->api('GET', $s['host'], "student/$p", $s['parent'])->assertForbidden();
            $this->api('GET', $s['host'], "student/$p", $s['karimUser'])->assertForbidden();
        }
        $this->assertSame($s['mine']->id, $this->api('GET', $s['host'], "student/dashboard?student_id={$s['sister']->id}", $mineU)->json('data.id'));
    }
}
