<?php

namespace Tests\Feature\Imports;

use App\Models\{Attendance, Batch, Enrollment, ImportJob, Program, Student};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{Queue, Storage};
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

// Step 4.2 Done When + data-migration.md: file -> map -> dry-run (writes nothing) -> run; 300 students with 5 bad rows: the bad rows
// are in their own report, 295 are created through StudentService/EnrollmentService; running the same file again skips every row;
// rollback removes what was created except a student that has records since.
class StudentImportTest extends TestCase
{
    use RefreshDatabase;

    private function xlsx(array $rows): UploadedFile
    {
        $book = new Spreadsheet();
        $book->getActiveSheet()->fromArray($rows, null, 'A1', true);
        $path = tempnam(sys_get_temp_dir(), 'imp') . '.xlsx';
        (new Xlsx($book))->save($path);
        return new UploadedFile($path, 'old-students.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
    }

    private function school(): array
    {
        Storage::fake('private');
        $i = $this->makeInstitution('impschool', 'school');
        $batch = Tenancy::as($i, fn () => Batch::create(['program_id' => Program::create(['name' => 'Class 6'])->id, 'name' => 'A', 'max_capacity' => 500]));
        return [$i, $this->makeUser($i, 'admin'), $this->hostOf($i), $batch];
    }

    public function test_three_hundred_students_with_five_bad_rows_then_a_rerun_skips_everything(): void
    {
        [$i, $admin, $host] = $this->school();
        // an old register: its own column names, the batch written as "Class - Section"
        $rows = [['Student Name', 'Mobile', 'Section', 'Roll', 'Gender', 'DOB']];
        for ($n = 1; $n <= 300; $n++) $rows[] = ["Student {$n}", '0171' . str_pad((string) $n, 7, '0', STR_PAD_LEFT), 'Class 6 - A', $n, 'male', '2014-01-01'];
        $rows[11][1] = '12345';                 // bad phone
        $rows[22][2] = 'Class 9 - Z';           // unknown batch
        $rows[33][0] = '';                      // no name
        $rows[44][4] = 'boy';                   // bad gender
        $rows[55] = $rows[54];                  // the same student twice in the file

        $job = $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => $this->xlsx($rows)])->assertCreated()->json('data');
        $this->assertSame(300, $job['summary']['total']);
        $this->assertStringStartsWith("institutions/{$i->id}/imports/{$job['id']}.", Tenancy::as($i, fn () => ImportJob::find($job['id'])->file_path));
        $this->api('POST', $host, "imports/{$job['id']}/dry-run", $admin)->assertStatus(422)->assertJsonPath('error', 'import_wrong_state');   // map first
        $this->api('PUT', $host, "imports/{$job['id']}/mapping", $admin, ['mapping' => ['name' => 'Student Name']])->assertStatus(422)->assertJsonPath('error', 'import_mapping_missing');
        $this->api('PUT', $host, "imports/{$job['id']}/mapping", $admin, ['mapping' => ['name' => 'Student Name', 'guardian_phone' => 'Mobile',
            'batch' => 'Section', 'roll_no' => 'Roll', 'gender' => 'Gender', 'date_of_birth' => 'DOB']])->assertOk()->assertJsonPath('data.status', 'mapped');

        $dry = $this->api('POST', $host, "imports/{$job['id']}/dry-run", $admin)->assertOk()->json('data.summary');
        $this->assertSame([295, 5, 0], [$dry['ok'], $dry['error'], $dry['skipped']]);
        $this->assertSame(0, Tenancy::as($i, fn () => Student::count()), 'a dry run writes no student');
        $errors = $this->api('GET', $host, "imports/{$job['id']}?status=error", $admin)->json('data.rows');
        $this->assertSame([12, 23, 34, 45, 56], array_column($errors, 'row_no'), 'sheet row numbers (header = row 1)');
        $this->get("http://{$host}/api/v1/imports/{$job['id']}/errors.xlsx", ['Authorization' => 'Bearer ' . $admin->createToken('x')->plainTextToken])
            ->assertOk()->assertHeader('content-disposition');

        $this->api('POST', $host, "imports/{$job['id']}/run", $admin)->assertOk();
        $done = $this->api('GET', $host, "imports/{$job['id']}", $admin)->json('data');
        $this->assertSame(['done', 295, 5], [$done['status'], $done['summary']['ok'], $done['summary']['error']]);
        $this->assertSame(295, Tenancy::as($i, fn () => Student::count()));
        $this->assertSame(295, Tenancy::as($i, fn () => Enrollment::where('status', 'active')->count()), 'enrolled through EnrollmentService');
        $this->assertSame(7, Tenancy::as($i, fn () => Student::whereHas('user', fn ($u) => $u->where('name', 'Student 7'))->value('roll_no')));

        // the same file again: every good row already exists
        $again = $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => $this->xlsx($rows)])->json('data');
        $this->api('PUT', $host, "imports/{$again['id']}/mapping", $admin, ['mapping' => $done['mapping']])->assertOk();
        $second = $this->api('POST', $host, "imports/{$again['id']}/dry-run", $admin)->json('data.summary');
        $this->assertSame([0, 5, 295], [$second['ok'], $second['error'], $second['skipped']]);
        $this->api('POST', $host, "imports/{$again['id']}/run", $admin)->assertOk();
        $this->assertSame(295, Tenancy::as($i, fn () => Student::count()), 'nothing doubled');
    }

    public function test_rollback_removes_created_students_but_keeps_one_with_records_since(): void
    {
        [$i, $admin, $host, $batch] = $this->school();
        $rows = [['name', 'guardian_phone', 'batch'], ['A', '01711110001', 'A'], ['B', '01711110002', (string) $batch->id], ['C', '01711110003', 'A']];
        $id = $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => $this->xlsx($rows)])->json('data.id');
        $this->assertEqualsCanonicalizing(['name', 'guardian_phone', 'batch'], array_keys($this->api('GET', $host, "imports/{$id}", $admin)->json('data.mapping')), 'matching headers are mapped for you');
        $this->api('PUT', $host, "imports/{$id}/mapping", $admin, ['mapping' => ['name' => 'name', 'guardian_phone' => 'guardian_phone', 'batch' => 'batch']]);
        $this->api('POST', $host, "imports/{$id}/dry-run", $admin);
        $this->api('POST', $host, "imports/{$id}/run", $admin);
        $b = Tenancy::as($i, fn () => Student::whereHas('user', fn ($u) => $u->where('name', 'B'))->first());
        Tenancy::as($i, fn () => Attendance::create(['student_id' => $b->id, 'batch_id' => $batch->id, 'program_id' => $batch->program_id,
            'date' => now()->toDateString(), 'status' => 'present']));

        $res = $this->api('POST', $host, "imports/{$id}/rollback", $admin)->assertOk();
        $this->assertSame(['rolled_back', [3]], [$res->json('data.status'), $res->json('data.summary.rollback_kept')]);
        $this->assertSame(['B'], Tenancy::as($i, fn () => Student::with('user')->get()->pluck('user.name')->all()));
        $this->api('POST', $host, "imports/{$id}/rollback", $admin)->assertStatus(422)->assertJsonPath('error', 'import_wrong_state');

        // after 7 days a run cannot be rolled back
        $late = $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => $this->xlsx([['name', 'guardian_phone', 'batch'], ['D', '01711110004', 'A']])])->json('data.id');
        $this->api('PUT', $host, "imports/{$late}/mapping", $admin, ['mapping' => ['name' => 'name', 'guardian_phone' => 'guardian_phone', 'batch' => 'batch']]);
        $this->api('POST', $host, "imports/{$late}/dry-run", $admin);
        $this->api('POST', $host, "imports/{$late}/run", $admin);
        $this->travel(8)->days();
        $this->api('POST', $host, "imports/{$late}/rollback", $admin)->assertStatus(422)->assertJsonPath('error', 'import_rollback_expired');
    }

    public function test_a_coaching_row_may_name_several_batches_and_ansi_csv_is_refused(): void
    {
        Storage::fake('private');
        $i = $this->makeInstitution('impcoach', 'coaching');
        $admin = $this->makeUser($i, 'admin');
        $host = $this->hostOf($i);
        Tenancy::as($i, function () {
            $p = Program::create(['name' => 'HSC Physics']);
            Batch::create(['program_id' => $p->id, 'name' => 'Sat 4pm']);
            Batch::create(['program_id' => $p->id, 'name' => 'Mon 6pm']);
        });
        $csv = "\xEF\xBB\xBFname,guardian_phone,batch\nRiya,01711110009,\"Sat 4pm, Mon 6pm\"\n";
        $file = UploadedFile::fake()->createWithContent('list.csv', $csv);
        $id = $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => $file])->assertCreated()->json('data.id');
        $this->api('PUT', $host, "imports/{$id}/mapping", $admin, ['mapping' => ['name' => 'name', 'guardian_phone' => 'guardian_phone', 'batch' => 'batch']]);
        $this->api('POST', $host, "imports/{$id}/dry-run", $admin);
        $this->api('POST', $host, "imports/{$id}/run", $admin);
        $this->assertSame(2, Tenancy::as($i, fn () => Enrollment::where('status', 'active')->count()), 'one student, two batches, the first primary');

        $ansi = UploadedFile::fake()->createWithContent('old.csv', "name,guardian_phone,batch\n" . "\xC0\xEA\xE5,01711110010,Sat 4pm\n");
        $this->api('POST', $host, 'imports', $admin, ['kind' => 'students', 'file' => $ansi])->assertStatus(422)->assertJsonPath('error', 'bad_encoding');
    }
}
