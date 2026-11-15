<?php

namespace Tests\Feature\Payouts;

use App\Models\{Attendance, Batch, BatchTeacher, Expense, FeeCategory, FeePayment, PeriodAttendance, Program, Routine, Student, Subject, Teacher, TeacherPayout};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

// D223 TPO.1 (coaching-private-batch.md "Teacher Payouts"): the four pay types with worked examples, idempotent generate that
// touches drafts only, an edited amount needs a note, draft -> approved -> paid with one expense row, pay data for admin and
// accountant only, another institution's payout 404.
class TeacherPayoutTest extends TestCase
{
    use RefreshDatabase;

    private function setUpCoaching(string $slug): array
    {
        $this->travelTo('2026-11-10 10:00:00');
        $i = $this->makeInstitution($slug, 'coaching');
        $admin = $this->makeUser($i, 'admin');
        $data = Tenancy::as($i, function () {
            $tuition = FeeCategory::create(['name' => 'মাসিক ফি', 'amount' => 1000, 'frequency' => 'monthly']);
            $admission = FeeCategory::create(['name' => 'ভর্তি ফি', 'amount' => 500, 'frequency' => 'once']);
            $p = Program::create(['name' => 'HSC']);
            $b = Batch::create(['program_id' => $p->id, 'name' => 'Physics', 'monthly_fee' => 1000]);
            $s = Student::create(['student_id' => 'C-1', 'guardian_phone' => '01711111111']);
            $t = fn ($e) => Teacher::create(['employee_id' => $e, 'status' => 'active']);
            return ['tuition' => $tuition, 'admission' => $admission, 'program' => $p, 'batch' => $b, 'student' => $s,
                'fixed' => $t('T-FIX'), 'perclass' => $t('T-CLS'), 'percent' => $t('T-PCT'), 'salary' => $t('T-SAL')];
        });
        return [$i, $admin, $data];
    }

    public function test_the_four_pay_types_and_the_payout_flow(): void
    {
        [$i, $admin, $d] = $this->setUpCoaching('payco');
        $host = $this->hostOf($i);
        Tenancy::as($i, function () use ($d) {
            $b = $d['batch'];
            BatchTeacher::create(['batch_id' => $b->id, 'teacher_id' => $d['fixed']->id, 'subject_id' => 0, 'pay_type' => 'fixed_monthly', 'pay_rate' => '3000.00']);
            BatchTeacher::create(['batch_id' => $b->id, 'teacher_id' => $d['perclass']->id, 'subject_id' => 0, 'pay_type' => 'per_class', 'pay_rate' => '250.00']);
            BatchTeacher::create(['batch_id' => $b->id, 'teacher_id' => $d['percent']->id, 'subject_id' => 0, 'pay_type' => 'percentage', 'pay_rate' => '12.50']);
            BatchTeacher::create(['batch_id' => $b->id, 'teacher_id' => $d['salary']->id, 'subject_id' => 0, 'pay_type' => 'salary', 'pay_rate' => '0.00']);
            foreach (['2026-10-03', '2026-10-05', '2026-10-05', '2026-10-09', '2026-11-01'] as $k => $day) {   // 3 distinct October days
                $s = $k === 2 ? Student::create(['student_id' => 'C-2', 'guardian_phone' => '01711111112']) : $d['student'];
                Attendance::firstOrCreate(['student_id' => $s->id, 'batch_id' => $b->id, 'date' => $day], ['program_id' => $d['program']->id, 'status' => 'present']);
            }
            $line = 0;
            foreach ([[$d['tuition'], '1000.00', '2026-10'], [$d['tuition'], '600.50', '2026-10'], [$d['admission'], '500.00', '2026-10'], [$d['tuition'], '1000.00', '2026-11']] as [$cat, $paid, $month]) {
                FeePayment::create(['student_id' => $d['student']->id, 'batch_id' => $b->id, 'fee_category_id' => $cat->id, 'amount' => $paid, 'paid_amount' => $paid,
                    'month' => $month, 'receipt_no' => 'R-' . (++$line), 'line_no' => 1]);
            }
        });

        $rows = collect($this->api('POST', $host, 'teacher-payouts/generate', $admin, ['month' => '2026-10'])->assertOk()->json('data'))->keyBy('teacher.id');
        $this->assertSame('3000.00', $rows[$d['fixed']->id]['amount'], 'fixed monthly = the rate');
        $this->assertSame([3, '750.00'], [$rows[$d['perclass']->id]['classes_taken'], $rows[$d['perclass']->id]['amount']], '3 distinct attendance days x 250');
        $this->assertSame(['1600.50', '200.06'], [$rows[$d['percent']->id]['collection_base'], $rows[$d['percent']->id]['amount']], 'monthly fee only (1000 + 600.50) x 12.5% = 200.0625 -> 200.06');
        $this->assertArrayNotHasKey($d['salary']->id, $rows->all(), 'salary teachers get no payout');

        $fixed = $rows[$d['fixed']->id]['id'];
        $this->api('PUT', $host, "teacher-payouts/{$fixed}", $admin, ['amount' => '3200'])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->api('PUT', $host, "teacher-payouts/{$fixed}", $admin, ['amount' => '3200', 'note' => 'September short by 200'])->assertOk()->assertJsonPath('data.amount', '3200.00');
        $again = collect($this->api('POST', $host, 'teacher-payouts/generate', $admin, ['month' => '2026-10'])->assertOk()->json('data'))->keyBy('teacher.id');
        $this->assertCount(3, $again, 'generate is idempotent');
        $this->assertSame('3200.00', $again[$d['fixed']->id]['amount'], 'an edited draft keeps the noted amount');

        $this->api('POST', $host, "teacher-payouts/{$fixed}/pay", $admin, ['method' => 'cash', 'date' => '2026-11-10'])->assertStatus(409)->assertJsonPath('error', 'payout_not_approved');
        $this->api('POST', $host, "teacher-payouts/{$fixed}/approve", $admin)->assertOk()->assertJsonPath('data.status', 'approved');
        $this->api('PUT', $host, "teacher-payouts/{$fixed}", $admin, ['note' => 'x'])->assertStatus(409)->assertJsonPath('error', 'payout_not_draft');
        $accountant = $this->makeUser($i, 'accountant');
        $this->api('POST', $host, "teacher-payouts/{$fixed}/pay", $accountant, ['method' => 'cash', 'date' => '2026-11-10'])->assertOk()->assertJsonPath('data.status', 'paid');
        $this->api('POST', $host, "teacher-payouts/{$fixed}/pay", $accountant, ['method' => 'cash', 'date' => '2026-11-10'])->assertStatus(409);
        Tenancy::as($i, function () use ($fixed) {
            $e = Expense::where('source', 'teacher_payout')->sole();
            $this->assertSame(['teacher_payout', '3200.00', 'cash'], [$e->category, (string) $e->amount, $e->payment_method]);
            $this->assertStringContainsString("#{$fixed}", $e->title);
        });

        Tenancy::as($i, fn () => BatchTeacher::where('teacher_id', $d['fixed']->id)->update(['pay_rate' => '9999.00']));
        $this->api('POST', $host, 'teacher-payouts/generate', $admin, ['month' => '2026-10'])->assertOk();
        $this->assertSame('3200.00', Tenancy::as($i, fn () => (string) TeacherPayout::find($fixed)->amount), 'a paid payout never changes');

        $this->api('GET', $host, 'teacher-payouts?month=2026-10', $this->makeUser($i, 'teacher'))->assertForbidden();
        $this->api('GET', $host, 'teacher-payouts?month=2026-13', $admin)->assertStatus(422);

        [$j, $otherAdmin] = $this->setUpCoaching('payco2');
        $this->api('POST', $this->hostOf($j), "teacher-payouts/{$fixed}/approve", $otherAdmin)->assertNotFound();
        $this->api('PUT', $this->hostOf($j), "teacher-payouts/{$fixed}", $otherAdmin, ['note' => 'x'])->assertNotFound();
        $this->api('POST', $this->hostOf($j), "teacher-payouts/{$fixed}/pay", $otherAdmin, ['method' => 'cash', 'date' => '2026-11-10'])->assertNotFound();
    }

    public function test_per_class_counts_a_teachers_own_periods_where_period_attendance_exists(): void
    {
        [$i, $admin, $d] = $this->setUpCoaching('payper');
        Tenancy::as($i, function () use ($d) {
            $b = $d['batch'];
            $math = Subject::create(['program_id' => $d['program']->id, 'name' => 'Math']);
            BatchTeacher::create(['batch_id' => $b->id, 'teacher_id' => $d['perclass']->id, 'subject_id' => $math->id, 'pay_type' => 'per_class', 'pay_rate' => '300.00']);
            BatchTeacher::create(['batch_id' => $b->id, 'teacher_id' => $d['fixed']->id, 'subject_id' => $math->id, 'pay_type' => 'per_class', 'pay_rate' => '300.00']);
            $mine = Routine::create(['program_id' => $d['program']->id, 'batch_id' => $b->id, 'subject_id' => $math->id, 'teacher_id' => $d['perclass']->id, 'day_of_week' => 'sun', 'start_time' => '09:00', 'end_time' => '09:45']);
            $other = Routine::create(['program_id' => $d['program']->id, 'batch_id' => $b->id, 'subject_id' => $math->id, 'teacher_id' => $d['fixed']->id, 'day_of_week' => 'mon', 'start_time' => '09:00', 'end_time' => '09:45']);
            foreach ([[$mine, '2026-10-04'], [$mine, '2026-10-11'], [$other, '2026-10-05']] as [$r, $day]) PeriodAttendance::create(['student_id' => $d['student']->id, 'routine_id' => $r->id, 'date' => $day, 'status' => 'present']);
            Attendance::create(['student_id' => $d['student']->id, 'program_id' => $d['program']->id, 'batch_id' => $b->id, 'date' => '2026-10-20', 'status' => 'present']);
        });
        $rows = collect($this->api('POST', $this->hostOf($i), 'teacher-payouts/generate', $admin, ['month' => '2026-10'])->assertOk()->json('data'))->keyBy('teacher.id');
        $this->assertSame([2, '600.00'], [$rows[$d['perclass']->id]['classes_taken'], $rows[$d['perclass']->id]['amount']], 'own two periods, not the batch days');
        $this->assertSame([1, '300.00'], [$rows[$d['fixed']->id]['classes_taken'], $rows[$d['fixed']->id]['amount']]);
    }

    public function test_the_admin_sets_pay_on_the_batch_and_only_admin_and_accountant_see_it(): void
    {
        $i = $this->makeInstitution('paybatch', 'coaching');
        [$admin, $host] = [$this->makeUser($i, 'admin'), $this->hostOf($i)];
        $program = $this->api('POST', $host, 'programs', $admin, ['name' => 'HSC'])->assertCreated()->json('data.id');
        $teacher = $this->api('POST', $host, 'teachers', $admin, ['name' => 'Rahim', 'phone' => '01722220002'])->assertCreated()->json('data.id');
        $batch = $this->api('POST', $host, 'batches', $admin, ['program_id' => $program, 'name' => 'A',
            'subject_teachers' => [['subject_id' => 0, 'teacher_id' => $teacher, 'pay_type' => 'percentage', 'pay_rate' => '150']]])->assertStatus(422)->assertJsonValidationErrors('subject_teachers.0.pay_rate');
        $batch = $this->api('POST', $host, 'batches', $admin, ['program_id' => $program, 'name' => 'A',
            'subject_teachers' => [['subject_id' => 0, 'teacher_id' => $teacher, 'pay_type' => 'per_class', 'pay_rate' => '250.50']]])->assertCreated()
            ->assertJsonPath('data.subject_teachers.0.pay_type', 'per_class')->assertJsonPath('data.subject_teachers.0.pay_rate', '250.50')->json('data.id');
        $this->api('PUT', $host, "batches/{$batch}", $admin, ['subject_teachers' => [['subject_id' => 0, 'teacher_id' => $teacher]]])->assertOk()
            ->assertJsonPath('data.subject_teachers.0.pay_rate', '250.50');                                   // not sent = kept
        $this->api('GET', $host, "batches/{$batch}", $admin)->assertOk()->assertJsonPath('data.subject_teachers.0.pay_type', 'per_class');
        $list = $this->api('GET', $host, 'batches', $this->makeUser($i, 'teacher'))->assertOk()->getContent();
        $this->assertStringNotContainsString('pay_rate', $list, 'pay data is not for teachers (D33)');
    }

    public function test_a_teacher_sees_only_their_own_final_payouts_and_is_told_when_paid(): void
    {
        [$i, $admin, $d] = $this->setUpCoaching('payown');
        $host = $this->hostOf($i);
        $me = $this->makeUser($i, 'teacher');
        $other = \App\Models\User::create(['institution_id' => $i->id, 'name' => 'other', 'email' => 'other-teacher@example.test', 'password' => 'Secret@1234', 'role' => 'teacher', 'is_active' => true]);
        [$d['fixed'], $d['perclass']] = Tenancy::as($i, function () use ($d, $me, $other) {
            $t = fn ($u, $e) => Teacher::where('user_id', $u->id)->first() ?? Teacher::create(['user_id' => $u->id, 'employee_id' => $e, 'status' => 'active']);
            [$a, $b] = [$t($me, 'T-ME'), $t($other, 'T-OT')];
            BatchTeacher::create(['batch_id' => $d['batch']->id, 'teacher_id' => $a->id, 'subject_id' => 0, 'pay_type' => 'fixed_monthly', 'pay_rate' => '3000.00']);
            BatchTeacher::create(['batch_id' => $d['batch']->id, 'teacher_id' => $b->id, 'subject_id' => 0, 'pay_type' => 'fixed_monthly', 'pay_rate' => '1000.00']);
            return [$a, $b];
        });
        $rows = collect($this->api('POST', $host, 'teacher-payouts/generate', $admin, ['month' => '2026-10'])->json('data'))->keyBy('teacher.id');
        $this->assertSame([], $this->api('GET', $host, 'teacher/payouts', $me)->assertOk()->json('data'), 'a draft is not shown');
        $mine = $rows[$d['fixed']->id]['id'];
        $this->api('POST', $host, "teacher-payouts/{$mine}/approve", $admin)->assertOk();
        $this->api('POST', $host, "teacher-payouts/{$mine}/pay", $admin, ['method' => 'bkash', 'date' => '2026-11-10'])->assertOk();
        $list = $this->api('GET', $host, 'teacher/payouts', $me)->assertOk()->json('data');
        $this->assertSame([[$mine, '3000.00', 'paid']], array_map(fn ($r) => [$r['id'], $r['amount'], $r['status']], $list));
        $this->assertArrayNotHasKey('note', $list[0]);
        $this->assertSame([], $this->api('GET', $host, 'teacher/payouts', $other)->json('data'), "another teacher's payout is not shown");
        $this->api('GET', $host, 'teacher/payouts', $admin)->assertForbidden();
        $n = $me->fresh()->notifications()->sole();
        $this->assertSame('teacher_payout_paid', $n->data['type'] ?? $n->data['kind'] ?? null);
        $this->assertStringNotContainsString('3000', json_encode($n->data), 'no amount in the notice');
        $this->assertSame(0, $other->fresh()->notifications()->count());
    }
}
