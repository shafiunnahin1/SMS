<?php

namespace App\Services\Export;

use App\Models\{Institution, TenantExport};
use Illuminate\Support\Facades\{DB, Schema, Storage};
use Illuminate\Support\Str;
use ZipArchive;

// D193 EXP.1 (platform-ops.md section 5.2, D38): builds the v1 file - manifest.json, data/<table>.ndjson (one row per line, in the
// map's FK order, only this institution's rows), files/<disk>/<path> (the institution's own files) - then encrypts it with the
// requester's passphrase, which is never stored. Excluded tables (secrets, logs, platform-owned) are never read; a backup also
// leaves out the payroll group and the teacher salary columns (D33).
final class TenantExporter
{
    public function __construct(private ExportMap $map) {}

    /** $payroll: the admin ticked "include salary data" (an export only; a backup never has it, D33) */
    public function build(TenantExport $export, string $passphrase, bool $payroll = false): TenantExport
    {
        $i = Institution::findOrFail($export->institution_id);
        $export->update(['status' => 'running']);
        $tmp = sys_get_temp_dir() . '/export-' . Str::uuid();   // a throw-away work file, deleted below
        $zipPath = $tmp . '.zip';
        $encPath = $tmp . '.edux';
        try {
            $zip = new ZipArchive();
            $zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
            $payroll = $payroll && $export->kind === 'export';
            $nulled = $this->map->nulledColumns($export->kind, $payroll);
            $tables = [];
            $rows = 0;
            foreach ($this->map->tables($export->kind, $payroll) as $t) {
                $cols = Schema::getColumnListing($t);
                $lines = '';
                $n = 0;
                DB::table($t)->where('institution_id', $i->id)->orderBy('id')->chunkById(1000, function ($chunk) use (&$lines, &$n, $t, $nulled, $cols) {
                    foreach ($chunk as $r) {
                        $r = (array) $r;
                        foreach ($nulled as $c) if (str_starts_with($c, "$t.") && in_array(substr($c, strlen($t) + 1), $cols, true)) $r[substr($c, strlen($t) + 1)] = null;
                        $lines .= json_encode($r, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n";
                        $n++;
                    }
                });
                $zip->addFromString("data/$t.ndjson", $lines);
                $tables[] = ['table' => $t, 'rows' => $n, 'sha256' => hash('sha256', $lines)];
                $rows += $n;
            }
            $files = [];
            foreach (['private', 'public'] as $disk) {
                foreach (Storage::disk($disk)->allFiles("institutions/{$i->id}") as $path) {
                    if (str_starts_with($path, "institutions/{$i->id}/imports/")) continue;            // import files are operational (excluded)
                    $bytes = Storage::disk($disk)->get($path);
                    $zip->addFromString("files/$disk/$path", $bytes);
                    $files[] = ['disk' => $disk, 'path' => $path, 'sha256' => hash('sha256', $bytes)];
                }
            }
            $manifest = ['format_version' => 1, 'kind' => $export->kind, 'payroll' => $payroll, 'exported_at' => now()->toIso8601String(),
                'schema_migration' => DB::table('migrations')->max('migration'), 'source_institution_id' => $i->id,
                'institution' => ['name' => $i->name, 'institution_type' => $i->institution_type], 'tables' => $tables, 'files' => $files];
            $zip->addFromString('manifest.json', json_encode($manifest, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
            $zip->close();
            ExportCrypto::encryptFile($zipPath, $encPath, $passphrase);
            $stored = "exports/{$i->id}/" . Str::uuid() . '.edux';
            Storage::disk('private')->put($stored, fopen($encPath, 'rb'));
            $export->update(['status' => 'ready', 'tables_count' => count($tables), 'rows_count' => $rows, 'file_path' => $stored,
                'size_bytes' => filesize($encPath), 'checksum' => hash_file('sha256', $encPath), 'finished_at' => now(),
                'expires_at' => now()->addHours((int) config('tenant_export.retention_hours'))]);
        } catch (\Throwable $e) {
            $export->update(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 255), 'finished_at' => now()]);
            throw $e;
        } finally {
            @unlink($zipPath);
            @unlink($encPath);
        }
        return $export->fresh();
    }
}
