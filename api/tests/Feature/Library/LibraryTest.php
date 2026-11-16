<?php

namespace Tests\Feature\Library;

use App\Models\{AuditLog, Batch, BookIssue, FeePayment, Program, Student, User};
use App\Services\StudentService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{Artisan, Queue};
use Tests\TestCase;

// D227 LIB.1 (docs/modules/library.md): books (copies never below the copies out, removal only if never issued), issue / return
// with the server's fine (settings: loan days, day fine), the fine collected as a fee receipt line or waived by the admin, the daily
// overdue mark with one in-app notice, staff exact keys, the student's / parent's own read-only view, another institution 404.
class LibraryTest extends TestCase
{
    use RefreshDatabase;

    private function school(string $slug): array
    {
        Queue::fake();
        $this->travelTo('2026-11-01 10:00:00');
        $i = $this->makeInstitution($slug, 'school');
        $admin = $this->makeUser($i, 'admin');
        $student = Tenancy::as($i, function () {
            $b = Batch::create(['program_id' => Program::create(['name' => 'Class 8'])->id, 'name' => 'A']);
            return app(StudentService::class)->create(['name' => 'Rafi', 'guardian_phone' => '01711111111'], $b);
        });
        return [$i, $admin, $student, $this->hostOf($i)];
    }

    public function test_books_issue_return_fine_collection_and_waiver(): void
    {
        [$i, $admin, $student, $host] = $this->school('lib1');
        $book = $this->api('POST', $host, 'library/books', $admin, ['title' => 'আম আঁটির ভেঁপু', 'author' => 'বিভূতিভূষণ', 'category' => 'গল্প', 'total_copies' => 2])->assertCreated()->json('data');
        $this->assertSame([2, 2], [$book['total_copies'], $book['available_copies']]);
        $this->api('PUT', $host, 'library/settings', $admin, ['loan_days' => 7, 'fine_per_day' => '2.50'])->assertOk()->assertJsonPath('data.loan_days', 7);

        $issue = $this->api('POST', $host, 'library/issue', $admin, ['book_id' => $book['id'], 'student_id' => $student->id])->assertCreated()->json('data');
        $this->assertSame(['2026-11-01', '2026-11-08', 'issued'], [$issue['issue_date'], $issue['due_date'], $issue['status']]);
        $code = Tenancy::as($i, fn () => Student::find($student->id)->student_id);
        $this->api('POST', $host, 'library/issue', $admin, ['book_id' => $book['id'], 'student_code' => 'NOPE'])->assertStatus(422)->assertJsonValidationErrors('student_code');
        $this->api('POST', $host, 'library/issue', $admin, ['book_id' => $book['id'], 'student_code' => $code])->assertCreated()->assertJsonPath('data.student.id', $student->id);   // LIB.2: by the card ID
        $this->api('POST', $host, 'library/issue', $admin, ['book_id' => $book['id'], 'student_id' => $student->id])->assertStatus(422)->assertJsonPath('error', 'book_not_available');
        $this->api('PUT', $host, "library/books/{$book['id']}", $admin, ['total_copies' => 1])->assertStatus(422)->assertJsonValidationErrors('total_copies');
        $this->api('PUT', $host, "library/books/{$book['id']}", $admin, ['total_copies' => 3])->assertOk()->assertJsonPath('data.available_copies', 1);
        $this->api('DELETE', $host, "library/books/{$book['id']}", $admin)->assertStatus(409);
        $this->assertSame(2, count($this->api('GET', $host, 'library/issued', $admin)->assertOk()->json('data')));

        $this->travelTo('2026-11-12 09:00:00');                                    // 4 days late
        $back = $this->api('POST', $host, "library/return/{$issue['id']}", $admin)->assertOk()->json('data');
        $this->assertSame(['returned', '10.00', false], [$back['status'], $back['fine_amount'], $back['fine_paid']], '4 days x 2.50');
        $this->api('POST', $host, "library/return/{$issue['id']}", $admin)->assertStatus(409);
        $this->assertSame(2, $this->api('GET', $host, 'library/books', $admin)->json('data.0.available_copies'));

        $this->api('POST', $host, "library/issues/{$issue['id']}/collect-fine", $this->makeUser($i, 'teacher'), ['method' => 'cash'])->assertForbidden();
        $accountant = $this->makeUser($i, 'accountant');
        $this->assertContains($issue['id'], array_column($this->api('GET', $host, 'library/overdue', $accountant)->assertOk()->json('data'), 'id'), 'LIB.2: the accountant sees the unpaid fine');
        $receipt = $this->api('POST', $host, "library/issues/{$issue['id']}/collect-fine", $accountant, ['method' => 'cash'])->assertOk()->json('data.receipt_no');
        Tenancy::as($i, function () use ($receipt, $issue, $student) {
            $p = FeePayment::where('receipt_no', $receipt)->sole();
            $this->assertSame(['10.00', $student->id, 'লাইব্রেরি জরিমানা'], [(string) $p->paid_amount, $p->student_id, $p->feeCategory->name]);
            $this->assertTrue(BookIssue::find($issue['id'])->fine_paid);
        });
        $this->api('POST', $host, "library/issues/{$issue['id']}/collect-fine", $admin, ['method' => 'cash'])->assertStatus(409);
        $this->assertSame([], Tenancy::as($i, fn () => app(\App\Services\FeeService::class)->dueLines(Student::find($student->id))
            ->filter(fn ($l) => $l['category'] === 'লাইব্রেরি জরিমানা')->values()->all()), 'the fine category never becomes a general due');

        $second = Tenancy::as($i, fn () => BookIssue::where('id', '!=', $issue['id'])->sole());
        $this->api('POST', $host, "library/return/{$second->id}", $admin)->assertOk()->assertJsonPath('data.fine_amount', '10.00');
        $this->api('POST', $host, "library/issues/{$second->id}/waive", $admin, ['reason' => 'বই ভালো অবস্থায় ফেরত'])->assertOk()->assertJsonPath('data.fine_amount', '0.00');
        $this->assertSame('10.00', Tenancy::as($i, fn () => AuditLog::where('action', 'library.fine_waived')->sole()->new_data['was']));
    }

    public function test_the_overdue_job_staff_keys_and_the_family_view(): void
    {
        [$i, $admin, $student, $host] = $this->school('lib2');
        $book = $this->api('POST', $host, 'library/books', $admin, ['title' => 'Physics', 'total_copies' => 1])->assertCreated()->json('data');
        $issue = $this->api('POST', $host, 'library/issue', $admin, ['book_id' => $book['id'], 'student_id' => $student->id])->assertCreated()->json('data');
        $this->travelTo('2026-11-20 08:00:00');
        Artisan::call('library:overdue');
        Artisan::call('library:overdue');                                          // once only
        $this->assertSame('overdue', Tenancy::as($i, fn () => BookIssue::find($issue['id'])->status));
        $parent = Tenancy::as($i, fn () => Student::find($student->id)->parents()->first());
        $studentUser = User::find(Tenancy::as($i, fn () => Student::find($student->id)->user_id));
        $this->assertSame([1, 1], [$parent->notifications()->count(), $studentUser->notifications()->count()]);
        $this->assertSame('library_overdue', $parent->notifications()->first()->data['type']);
        $over = $this->api('GET', $host, 'library/overdue', $admin)->assertOk()->json('data.0');
        $this->assertSame('25.00', $over['fine_so_far'], 'due 15 Nov, today 20 Nov: 5 days x 5.00 so far');

        $parent->forceFill(['must_change_password' => false])->save();
        $studentUser->forceFill(['must_change_password' => false])->save();
        $this->assertSame([['Physics', 'overdue']], array_map(fn ($r) => [$r['book']['title'], $r['status']], $this->api('GET', $host, "parent/children/{$student->id}/library", $parent)->assertOk()->json('data')));
        $this->assertCount(1, $this->api('GET', $host, 'student/library', $studentUser)->assertOk()->json('data'));
        $this->api('GET', $host, 'library/books', $studentUser)->assertForbidden();

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
        [$reader, $rd] = $staff('LibReader', ['staff.library.read']);
        [$desk, $dd] = $staff('LibDesk', ['staff.library.circulate']);
        $as($reader, $rd, 'GET', 'library/books')->assertOk();
        $as($reader, $rd, 'POST', 'library/books', ['title' => 'x'])->assertForbidden();
        $as($desk, $dd, 'POST', "library/return/{$issue['id']}")->assertOk()->assertJsonPath('data.fine_amount', '25.00');
        $as($desk, $dd, 'GET', 'library/issued')->assertForbidden();
        $as($desk, $dd, 'POST', "library/issues/{$issue['id']}/waive", ['reason' => 'x'])->assertForbidden();

        [$j, $otherAdmin, , $otherHost] = $this->school('lib3');
        $this->api('POST', $otherHost, "library/return/{$issue['id']}", $otherAdmin)->assertNotFound();
        $this->api('PUT', $otherHost, "library/books/{$book['id']}", $otherAdmin, ['title' => 'x'])->assertNotFound();
        $this->api('GET', $otherHost, "library/history/{$student->id}", $otherAdmin)->assertNotFound();
    }
}
