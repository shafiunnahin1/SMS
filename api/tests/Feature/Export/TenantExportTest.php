<?php

namespace Tests\Feature\Export;

use App\Models\{Attendance, FeeCategory, Institution, Notice, Result, Routine, Student, Teacher, TenantExport, User};
use App\Services\Export\{ExportCrypto, ExportMap, TenantImporter};
use App\Support\Tenancy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\{DB, Schema, Storage};
use Tests\Feature\Exams\ExamFixture;
use Tests\TestCase;
use ZipArchive;

// D193 EXP.1 (platform-ops.md section 8: TenantRoundTripTest, ExportSecretsTest, ExportAccessTest, ImportSafetyTest): an institution
// A is exported and imported as a new institution B - the same row counts, every reference of B inside B (none into A), the same
// structure (ids compared by rank); a broken map is caught; secrets, logs and other institutions never enter the file; the admin
// needs the password again, gets one export a day and one download; the existing institution is never touched; a failed import
// leaves nothing.
class TenantExportTest extends TestCase
{
    use RefreshDatabase, ExamFixture;

    private const PASS = 'correct horse battery';

    private function seeded(string $slug): array
    {
        Storage::fake('private');
        Storage::fake('public');
        $s = $this->school($slug);
        Tenancy::as($s['i'], function () use ($s) {
            FeeCategory::create(['name' => 'Tuition', 'amount' => '500.00', 'frequency' => 'monthly', 'applicable_to' => 'all']);
            $k = Teacher::where('user_id', $s['karimUser']->id)->first();
            Routine::create(['program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'subject_id' => $s['bangla']->id, 'teacher_id' => $k->id, 'day_of_week' => 'sun', 'start_time' => '09:00', 'end_time' => '09:45']);
            Attendance::create(['student_id' => $s['mine']->id, 'program_id' => $s['p']->id, 'batch_id' => $s['a']->id, 'date' => now()->toDateString(), 'status' => 'present']);
            Notice::create(['title' => 'Hello', 'content' => 'World', 'target' => 'all', 'created_by' => $s['admin']->id, 'published_at' => now()]);
            $path = "institutions/{$s['i']->id}/students/{$s['mine']->id}/photo-a.jpg";
            Storage::disk('private')->put($path, 'JPEGBYTES');
            Student::whereKey($s['mine']->id)->update(['photo' => $path]);
            User::whereKey($s['admin']->id)->update(['fcm_token' => 'device-token-secret']);
        });
        $exam = $this->exam($s);
        $lines = $this->api('GET', $s['host'], "fees/dues?student_id={$s['mine']->id}", $s['admin'])->json('data.lines');
        $this->api('POST', $s['host'], 'fees/collect', $s['admin'], ['student_id' => $s['mine']->id, 'payment_method' => 'cash', 'lines' => [['key' => $lines[0]['key']]]])->assertCreated();
        Tenancy::as($s['i'], fn () => Result::create(['exam_id' => $exam, 'student_id' => $s['mine']->id, 'subject_id' => $s['bangla']->id, 'marks_obtained' => 70]));
        return $s;
    }

    private function export(array $s, bool $payroll = false): TenantExport
    {
        $this->api('POST', $s['host'], 'admin/exports', $s['admin'], ['password' => 'Secret@1234', 'passphrase' => self::PASS, 'passphrase_confirmation' => self::PASS,
            'include_payroll' => $payroll])->assertCreated();
        return Tenancy::as($s['i'], fn () => TenantExport::latest('id')->first());
    }

    /** rows of one institution, ids replaced by their rank among that institution's rows of the target table */
    private function shape(int $inst, ExportMap $map): array
    {
        $rank = [];
        foreach ($map->tables() as $t) $rank[$t] = array_flip(DB::table($t)->where('institution_id', $inst)->orderBy('id')->pluck('id')->all());
        $out = [];
        foreach ($map->tables() as $t) {
            $rows = [];
            foreach (DB::table($t)->where('institution_id', $inst)->orderBy('id')->get() as $r) {
                $r = (array) $r;
                foreach ($map->refs($t) as $c => $target) if (isset($r[$c], $rank[$target])) $r[$c] = 'r' . ($rank[$target][$r[$c]] ?? 'LEAK');
                foreach ($map->polymorphic($t) as $p) if (isset($r[$p['id_col']], $rank[$p['targets'][$r[$p['type_col']]] ?? ''])) $r[$p['id_col']] = 'r' . ($rank[$p['targets'][$r[$p['type_col']]]][$r[$p['id_col']]] ?? 'LEAK');
                unset($r['id'], $r['institution_id'], $r['created_at'], $r['updated_at'], $r['photo'], $r['remember_token'], $r['fcm_token']);
                $rows[] = json_encode($r);
            }
            sort($rows);
            $out[$t] = $rows;
        }
        return $out;
    }

    public function test_round_trip_a_to_b(): void
    {
        $s = $this->seeded('exp-a');
        $e = $this->export($s, true);                                                     // salary data ticked: the full copy
        $this->assertSame('ready', $e->status);
        $this->assertGreaterThan(10, $e->rows_count);
        $sa = User::create(['institution_id' => null, 'name' => 'SA', 'role' => 'super_admin', 'phone' => '01799000041', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $central = 'admin.' . config('tenancy.base_domain');
        $before = $this->shape($s['i']->id, app(ExportMap::class));

        $b = $this->api('POST', $central, 'super/institutions/import', $sa, ['export_id' => $e->id, 'new_slug' => 'exp-b', 'passphrase' => self::PASS, 'status' => 'trial'])
            ->assertCreated()->json('data');
        $map = app(ExportMap::class);
        foreach ($map->tables() as $t) {
            $this->assertSame(DB::table($t)->where('institution_id', $s['i']->id)->count(), DB::table($t)->where('institution_id', $b['id'])->count(), "rows of $t");
            foreach ($map->refs($t) as $c => $target) {
                if (!$map->isTenantTable($target) || !Schema::hasTable($target) || !Schema::hasColumn($t, $c)) continue;
                $ids = DB::table($t)->where('institution_id', $b['id'])->whereNotNull($c)->pluck($c)->unique();
                $inside = DB::table($target)->where('institution_id', $b['id'])->whereIn('id', $ids)->count();
                $this->assertSame($ids->count(), $inside, "$t.$c points outside B");
            }
        }
        $after = $this->shape($b['id'], $map);
        foreach ($before as $t => $rows) $this->assertSame($rows, $after[$t], "B has the same structure as A: $t");
        $this->assertSame($before, $this->shape($s['i']->id, $map), 'A is untouched');
        $photo = DB::table('students')->where('institution_id', $b['id'])->whereNotNull('photo')->value('photo');
        $this->assertStringStartsWith("institutions/{$b['id']}/students/", $photo);
        $this->assertSame('JPEGBYTES', Storage::disk('private')->get($photo));
        $this->assertNull(DB::table('users')->where('institution_id', $b['id'])->whereNotNull('fcm_token')->value('id'), 'no token travels');
        $this->assertSame('trial', Institution::find($b['id'])->status);
    }

    public function test_a_broken_map_is_caught(): void
    {
        $s = $this->seeded('exp-broken');
        $e = $this->export($s);
        $path = Storage::disk('private')->path($e->file_path);
        $real = json_decode(file_get_contents(config('tenant_export.map')), true);
        $broken = $real;
        unset($broken['tables']['results']['refs']['student_id']);                    // a forgotten ref column
        $tmp = tempnam(sys_get_temp_dir(), 'map');
        file_put_contents($tmp, json_encode($broken));
        config(['tenant_export.map' => $tmp]);
        $this->app->forgetInstance(ExportMap::class);
        $b = app(TenantImporter::class)->import($path, self::PASS, 'exp-broken-b', 'trial', 0);
        $leak = DB::table('results')->where('institution_id', $b->id)->pluck('student_id')->diff(DB::table('students')->where('institution_id', $b->id)->pluck('id'));
        $this->assertNotEmpty($leak, 'the round-trip check sees a reference into A');

        $broken = $real;
        $broken['tables']['enrollments']['refs']['student_id'] = 'nowhere';            // bound to the wrong (unknown) table
        file_put_contents($tmp, json_encode($broken));
        $this->app->forgetInstance(ExportMap::class);
        $this->app->forgetInstance(TenantImporter::class);
        $count = Institution::count();
        try {
            app(TenantImporter::class)->import($path, self::PASS, 'exp-broken-c', 'trial', 0);
            $this->fail('an unknown table must stop the import');
        } catch (\Throwable $x) {
            $this->assertSame($count, Institution::count(), 'a failed import leaves no institution');
        }
        @unlink($tmp);
    }

    public function test_secrets_access_and_safety(): void
    {
        $s = $this->seeded('exp-acc');
        $other = $this->seeded('exp-other');
        $host = $s['host'];
        $body = ['password' => 'Secret@1234', 'passphrase' => self::PASS, 'passphrase_confirmation' => self::PASS];
        $this->api('POST', $host, 'admin/exports', $s['admin'], ['password' => 'wrong'] + $body)->assertStatus(422)->assertJsonPath('error', 'export_password_wrong');
        $this->api('POST', $host, 'admin/exports', $s['admin'], ['passphrase' => 'short', 'passphrase_confirmation' => 'short'] + $body)->assertStatus(422);
        $this->api('POST', $host, 'admin/exports', $s['karimUser'], $body)->assertForbidden();
        $id = $this->api('POST', $host, 'admin/exports', $s['admin'], $body)->assertCreated()->json('data.id');
        $this->api('POST', $host, 'admin/exports', $s['admin'], $body)->assertStatus(429)->assertJsonPath('error', 'export_once_a_day');
        $this->api('GET', $other['host'], "admin/exports/{$id}", $other['admin'])->assertNotFound();

        // the file: encrypted; inside only A's rows, no excluded table, no token
        $e = Tenancy::as($s['i'], fn () => TenantExport::find($id));
        $enc = Storage::disk('private')->path($e->file_path);
        $this->assertStringNotContainsString('Tuition', file_get_contents($enc));
        $zipPath = tempnam(sys_get_temp_dir(), 'z');
        ExportCrypto::decryptFile($enc, $zipPath, self::PASS);
        $zip = new ZipArchive();
        $zip->open($zipPath);
        $names = array_map(fn ($k) => $zip->getNameIndex($k), range(0, $zip->numFiles - 1));
        foreach (['data/audit_logs.ndjson', 'data/support_tickets.ndjson', 'data/tenant_exports.ndjson', 'data/import_jobs.ndjson', 'data/payroll_items.ndjson'] as $n) $this->assertNotContains($n, $names);
        $all = implode("\n", array_map(fn ($n) => (string) $zip->getFromName($n), array_filter($names, fn ($n) => str_starts_with($n, 'data/'))));
        $this->assertStringNotContainsString('device-token-secret', $all);
        foreach (array_filter(explode("\n", $all)) as $line) $this->assertSame($s['i']->id, json_decode($line, true)['institution_id']);
        $zip->close();
        @unlink($zipPath);
        try { ExportCrypto::decryptFile($enc, $zipPath, 'not the passphrase'); $this->fail('wrong passphrase'); } catch (\App\Exceptions\BusinessException $x) { $this->assertSame('export_decrypt_failed', $x->errorCode); }

        // download once
        $this->api('GET', $host, "admin/exports/{$id}/download", $s['admin'])->assertOk()->assertHeader('Content-Type', 'application/octet-stream');
        $this->api('GET', $host, "admin/exports/{$id}/download", $s['admin'])->assertStatus(410);
        $this->assertFalse(Storage::disk('private')->exists($e->file_path));

        // import safety: a taken slug and a wrong passphrase touch nothing
        $b = Tenancy::as($other['i'], fn () => TenantExport::create(['kind' => 'backup', 'status' => 'queued']));
        $b = Tenancy::as($other['i'], fn () => app(\App\Services\Export\TenantExporter::class)->build($b, self::PASS));
        $count = Institution::count();
        $sa = User::create(['institution_id' => null, 'name' => 'SA', 'role' => 'super_admin', 'phone' => '01799000042', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $central = 'admin.' . config('tenancy.base_domain');
        $this->api('POST', $central, 'super/institutions/import', $sa, ['export_id' => $b->id, 'new_slug' => 'exp-acc', 'passphrase' => self::PASS, 'status' => 'trial'])->assertStatus(422)->assertJsonPath('error', 'import_slug_taken');
        $this->api('POST', $central, 'super/institutions/import', $sa, ['export_id' => $b->id, 'new_slug' => 'exp-new', 'passphrase' => 'wrong wrong wrong', 'status' => 'trial'])->assertStatus(422)->assertJsonPath('error', 'export_decrypt_failed');
        $this->assertSame($count, Institution::count());

        // expiry: the hourly job deletes a ready file after 24 hours
        $this->travel(25)->hours();
        $this->artisan('exports:prune')->assertSuccessful();
        $this->assertFalse(Storage::disk('private')->exists($b->file_path));
        $this->assertSame('expired', Tenancy::as($other['i'], fn () => TenantExport::find($b->id)->status));
    }

    public function test_the_super_admin_backup_leaves_out_salary_data(): void
    {
        $s = $this->seeded('exp-bk');
        Tenancy::as($s['i'], fn () => Teacher::where('user_id', $s['karimUser']->id)->update(['salary' => '25000.00']));
        $sa = User::create(['institution_id' => null, 'name' => 'SA', 'role' => 'super_admin', 'phone' => '01799000043', 'password' => 'Super-pass-2026', 'is_active' => true]);
        $central = 'admin.' . config('tenancy.base_domain');
        $this->api('POST', $central, "super/institutions/{$s['i']->id}/backup", $sa, ['reason' => 'x', 'passphrase' => self::PASS, 'passphrase_confirmation' => self::PASS])->assertStatus(422);
        $id = $this->api('POST', $central, "super/institutions/{$s['i']->id}/backup", $sa, ['reason' => 'restore drill', 'passphrase' => self::PASS, 'passphrase_confirmation' => self::PASS])->assertCreated()->json('data.id');
        $e = Tenancy::as($s['i'], fn () => TenantExport::find($id));
        $zipPath = tempnam(sys_get_temp_dir(), 'z');
        ExportCrypto::decryptFile(Storage::disk('private')->path($e->file_path), $zipPath, self::PASS);
        $zip = new ZipArchive();
        $zip->open($zipPath);
        $this->assertStringNotContainsString('25000', (string) $zip->getFromName('data/teachers.ndjson'));
        $this->assertFalse($zip->getFromName('data/payroll_runs.ndjson'));
        $zip->close();
        @unlink($zipPath);
        $this->api('POST', $s['host'], "admin/exports/{$id}/download", $s['admin'])->assertStatus(405);
        $this->api('GET', $s['host'], "admin/exports/{$id}", $s['admin'])->assertNotFound();   // a backup is not the institution's download
    }
}
