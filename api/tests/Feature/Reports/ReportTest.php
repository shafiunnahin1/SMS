<?php

namespace Tests\Feature\Reports;

use App\Models\{Attendance, FeeCategory, Holiday};
use App\Services\ReportService;
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;

// Step 4.8 Done When: every report endpoint gives a real PDF (Chromium, D50) or Excel; column labels follow the institution's
// terms; accountant only the money reports; the consent form prints.
class ReportTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private function seedSchool(): array
    {
        $this->travelTo('2026-10-20 10:00:00');
        $s = $this->school('rep');
        Tenancy::as($s['i'], function () use ($s) {
            FeeCategory::create(['name' => 'Tuition', 'amount' => 500, 'frequency' => 'monthly']);
            Holiday::create(['title' => 'Puja', 'date' => '2026-10-02']);
            Attendance::create(['student_id' => $s['mine']->id, 'batch_id' => $s['a']->id, 'program_id' => $s['p']->id, 'date' => '2026-10-01', 'status' => 'present']);
            Attendance::create(['student_id' => $s['mine']->id, 'batch_id' => $s['a']->id, 'program_id' => $s['p']->id, 'date' => '2026-10-05', 'status' => 'absent']);
        });
        $key = $this->api('GET', $s['host'], "fees/dues?student_id={$s['other']->id}", $s['admin'])->json('data.lines.0.key');
        $this->api('POST', $s['host'], 'fees/collect', $s['admin'], ['student_id' => $s['other']->id, 'payment_method' => 'bkash', 'lines' => [['key' => $key]]])->assertCreated();
        return $s;
    }

    public function test_the_tables_hold_the_right_numbers(): void
    {
        $s = $this->seedSchool();
        $r = Tenancy::as($s['i'], function () use ($s) {
            $svc = app(ReportService::class);
            return [
                'students' => $svc->build('students', ['program_id' => $s['p']->id]),
                'attendance' => $svc->build('attendance', ['batch_id' => $s['a']->id, 'month' => '2026-10']),
                'dues' => $svc->build('dues', ['program_id' => $s['p']->id]),
                'fees' => $svc->build('fees', ['month' => '2026-10']),
            ];
        });
        $this->assertSame(Tenancy::as($s['i'], fn () => term('batch')), $r['students']['headings'][0]);
        $this->assertSame([['A', 1, 'Mine'], ['A', 2, 'Other'], ['B', 1, 'Sister']], array_map(fn ($row) => [$row[0], $row[1], $row[3]], $r['students']['rows']));

        $mine = $r['attendance']['rows'][0];
        $this->assertSame([1, 'Mine', 'P', 'H', '', '', 'A'], array_slice($mine, 0, 7));
        $this->assertSame('50%', end($mine));
        $this->assertCount(2 + 31 + 1, $r['attendance']['headings']);
        $this->assertTrue($r['attendance']['landscape']);

        $this->assertSame(['Mine', 'Sister'], array_column($r['dues']['rows'], 3), 'Other paid: not on the due list');
        $this->assertSame('1000.00', end($r['dues']['total']));

        $this->assertCount(1, $r['fees']['rows']);
        $this->assertSame(['500.00', '500.00'], [end($r['fees']['rows'][0]), end($r['fees']['total'])]);
    }

    public function test_labels_follow_the_institution_terms(): void
    {
        $school = $this->makeInstitution('termschool', 'school');
        $coaching = $this->makeInstitution('termcoach', 'coaching');
        $head = fn ($i) => Tenancy::as($i, fn () => app(ReportService::class)->build('students', [])['headings'][0]);
        $this->assertSame(Tenancy::as($school, fn () => term('batch')), $head($school));
        $this->assertSame(Tenancy::as($coaching, fn () => term('batch')), $head($coaching));
        $this->assertNotSame($head($school), $head($coaching), 'a school says section, a coaching says batch');
    }

    public function test_every_endpoint_answers_a_real_file_and_roles_are_kept_apart(): void
    {
        $s = $this->seedSchool();
        $host = $s['host'];
        $accountant = $this->makeUser($s['i'], 'accountant');
        $queries = ['students' => "program_id={$s['p']->id}", 'attendance' => "batch_id={$s['a']->id}&month=2026-10", 'dues' => "batch_id={$s['a']->id}", 'fees' => 'month=2026-10'];

        foreach ($queries as $type => $q) {
            $pdf = $this->api('GET', $host, "admin/reports/{$type}?{$q}", $s['admin'])->assertOk()->assertHeader('Content-Type', 'application/pdf')->getContent();
            $this->assertStringStartsWith('%PDF', $pdf, $type);
            $this->assertStringContainsString('Skia/PDF', $pdf, $type);
            $xlsx = $this->api('GET', $host, "admin/reports/{$type}?{$q}&format=xlsx", $s['admin'])->assertOk();
            $this->assertStringStartsWith('PK', file_get_contents($xlsx->baseResponse->getFile()->getPathname()), $type);
        }
        $this->api('GET', $host, 'admin/reports/attendance?month=2026-10', $s['admin'])->assertStatus(422);       // a batch is required
        $this->api('GET', $host, 'admin/reports/dues', $s['admin'])->assertStatus(422);                            // program or batch
        $this->api('GET', $host, 'admin/reports/salary?month=2026-10', $s['admin'])->assertNotFound();             // not an R1 report

        $this->api('GET', $host, 'accountant/reports/fees?month=2026-10', $accountant)->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->api('GET', $host, "accountant/reports/students?program_id={$s['p']->id}", $accountant)->assertNotFound();
        $this->api('GET', $host, 'admin/reports/fees?month=2026-10', $accountant)->assertForbidden();
        $this->api('GET', $host, 'admin/reports/fees?month=2026-10', $s['karimUser'])->assertForbidden();

        $foreign = $this->school('rep2');
        $this->api('GET', $host, "admin/reports/students?program_id={$foreign['p']->id}", $s['admin'])->assertStatus(422);

        $form = $this->api('GET', $host, "students/{$s['mine']->id}/consent-form.pdf", $s['admin'])->assertOk()->assertHeader('Content-Type', 'application/pdf')->getContent();
        $this->assertStringStartsWith('%PDF', $form);
        $this->api('GET', $host, "students/{$foreign['mine']->id}/consent-form.pdf", $s['admin'])->assertNotFound();
    }
}
