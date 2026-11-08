<?php

namespace App\Services\Export;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Institution};
use App\Support\Tenancy;
use Illuminate\Support\Facades\{DB, Schema, Storage};
use Illuminate\Support\Str;
use ZipArchive;

// D193 EXP.1 (platform-ops.md section 5.4, D38): an export becomes a NEW institution - never written over or merged into one that
// exists. Every row gets a new id; institution_id, every map ref, polymorphic pair and id inside a known JSON column is re-pointed
// to the new rows; a ref to an excluded table becomes NULL, to a platform table stays; a ref not in the map stops the import. One
// transaction: a failure leaves nothing (no half import), and the copied files are removed again.
final class TenantImporter
{
    /** json column => fn (array $value, \Closure $id) => array; $id(table, oldId) gives the new id */
    private array $json;

    public function __construct(private ExportMap $map)
    {
        $this->json = [
            'fee_refunds.refund_lines' => fn ($v, $id) => array_map(fn ($l) => ['fee_payment_id' => $id('fee_payments', $l['fee_payment_id'] ?? null)] + $l, $v),
            'payroll_items.breakdown' => fn ($v, $id) => array_map(fn ($l) => ['ref_id' => match ($l['source'] ?? null) {
                'structure' => $id('salary_components', $l['ref_id'] ?? null), 'adjustment' => $id('salary_adjustments', $l['ref_id'] ?? null),
                'advance' => $id('salary_advances', $l['ref_id'] ?? null), default => $l['ref_id'] ?? null }] + $l, $v),
            'bonus_schemes.applies_to' => fn ($v, $id) => isset($v['exclude'])
                ? ['exclude' => array_map(fn ($e) => ['id' => $id($e['type'] === 'teacher' ? 'teachers' : 'staff_members', $e['id'] ?? null)] + $e, $v['exclude'])] + $v : $v,
        ];
    }

    /** @return Institution the new institution (status as chosen) */
    public function import(string $encPath, string $passphrase, string $slug, string $status, int $by, ?int $exportId = null): Institution
    {
        if (Institution::where('slug', $slug)->exists()) throw new BusinessException('slug', 'import_slug_taken', 422);
        $tmp = sys_get_temp_dir() . '/import-' . Str::uuid();   // a throw-away work file, deleted below
        $copied = [];
        try {
            ExportCrypto::decryptFile($encPath, $tmp . '.zip', $passphrase);
            $zip = new ZipArchive();
            if ($zip->open($tmp . '.zip') !== true) throw new BusinessException('zip', 'export_decrypt_failed', 422);
            $manifest = json_decode((string) $zip->getFromName('manifest.json'), true);
            if (($manifest['format_version'] ?? null) !== 1) throw new BusinessException('format', 'import_format_unknown', 422);

            return DB::transaction(function () use ($zip, $manifest, $slug, $status, $by, $exportId, &$copied) {
                $i = Institution::create(['name' => $manifest['institution']['name'], 'slug' => $slug,
                    'institution_type' => $manifest['institution']['institution_type'], 'status' => 'inactive']);
                return Tenancy::as($i, function () use ($i, $zip, $manifest, $status, $by, $exportId, &$copied) {
                    $paths = $this->copyFiles($zip, $manifest, $i, $copied);
                    $this->rows($zip, $manifest, $i, $paths);
                    $i->update(['status' => $status]);
                    AuditLog::record('tenant.imported', $i, ['from_export' => $exportId, 'source' => $manifest['source_institution_id'] ?? null,
                        'tables' => count($manifest['tables']), 'rows' => array_sum(array_column($manifest['tables'], 'rows')), 'by' => $by]);
                    return $i->fresh();
                });
            });
        } catch (\Throwable $e) {
            foreach ($copied as [$disk, $path]) Storage::disk($disk)->delete($path);
            throw $e;
        } finally {
            @unlink($tmp . '.zip');
        }
    }

    /** files/<disk>/institutions/<old>/... -> institutions/<new>/imported/...; returns old path => new path (checked against sha256) */
    private function copyFiles(ZipArchive $zip, array $manifest, Institution $i, array &$copied): array
    {
        $old = $manifest['source_institution_id'];
        $map = [];
        foreach ($manifest['files'] ?? [] as $f) {
            $bytes = $zip->getFromName("files/{$f['disk']}/{$f['path']}");
            if ($bytes === false || hash('sha256', $bytes) !== $f['sha256']) throw new BusinessException('file', 'import_checksum', 422);
            $new = preg_replace('#^institutions/' . preg_quote((string) $old, '#') . '/#', "institutions/{$i->id}/", $f['path']);
            Storage::disk($f['disk'])->put($new, $bytes);
            $copied[] = [$f['disk'], $new];
            $map[$f['path']] = $new;
        }
        return $map;
    }

    private function rows(ZipArchive $zip, array $manifest, Institution $i, array $paths): void
    {
        $ids = [];                                   // table => [old id => new id]
        $later = [];                                 // [table, new id, column, target table, old value] - refs to rows not inserted yet
        $jsonLater = [];                             // [table, new id, column, decoded value]
        $tables = array_column($manifest['tables'], 'table');
        foreach ($manifest['tables'] as $meta) {
            $t = $meta['table'];
            if (!$this->map->isTenantTable($t) || $this->map->isExcluded($t)) throw new BusinessException("table $t", 'import_unmapped', 422, ['what' => $t]);
            if (!Schema::hasTable($t)) throw new BusinessException("table $t", 'import_unmapped', 422, ['what' => $t]);
            $raw = (string) $zip->getFromName("data/$t.ndjson");
            if (hash('sha256', $raw) !== $meta['sha256']) throw new BusinessException('data', 'import_checksum', 422);
            $cols = array_flip(Schema::getColumnListing($t));
            $refs = $this->map->refs($t);
            $poly = $this->map->polymorphic($t);
            foreach (array_filter(explode("\n", $raw)) as $line) {
                $r = json_decode($line, true, 512, JSON_THROW_ON_ERROR);
                $oldId = $r['id'];
                unset($r['id']);
                foreach (array_keys($r) as $c) {
                    if (!isset($cols[$c])) throw new BusinessException("column $t.$c", 'import_unmapped', 422, ['what' => "$t.$c"]);
                    if (is_string($r[$c]) && isset($paths[$r[$c]])) $r[$c] = $paths[$r[$c]];            // a stored file path
                }
                $r['institution_id'] = $i->id;
                $pending = [];
                foreach ($refs as $col => $target) {
                    if (!array_key_exists($col, $r) || $r[$col] === null) continue;
                    if ($this->map->isExcluded($target)) { $r[$col] = null; continue; }
                    if (!$this->map->isTenantTable($target)) {                                                // a platform row (catalogue): same id
                        if (!$this->map->isPlatformRef($t, $col, $target)) throw new BusinessException("ref $t.$col", 'import_unmapped', 422, ['what' => "$t.$col -> $target"]);
                        continue;
                    }
                    if (isset($ids[$target][$r[$col]])) { $r[$col] = $ids[$target][$r[$col]]; continue; }
                    if (!in_array($target, $tables, true) && !Schema::hasTable($target)) { $r[$col] = null; continue; }
                    $pending[] = [$col, $target, $r[$col]];
                    $r[$col] = null;
                }
                foreach ($poly as $p) {
                    $type = $r[$p['type_col']] ?? null;
                    if ($type === null || ($r[$p['id_col']] ?? null) === null) continue;
                    $target = $p['targets'][$type] ?? throw new BusinessException("poly $t", 'import_unmapped', 422, ['what' => "$t.{$p['type_col']}=$type"]);
                    if (isset($ids[$target][$r[$p['id_col']]])) $r[$p['id_col']] = $ids[$target][$r[$p['id_col']]];
                    else { $pending[] = [$p['id_col'], $target, $r[$p['id_col']]]; $r[$p['id_col']] = 0; }
                }
                foreach ($this->map->regenerate() as $rc) {
                    [$rt, $rcol] = explode('.', $rc);
                    if ($rt === $t && ($r[$rcol] ?? null) !== null) $r[$rcol] = 'IMP-' . $i->id . '-' . $r[$rcol];
                }
                $json = [];
                foreach ($this->map->jsonWithIds() as $jc) {
                    [$jt, $jcol] = explode('.', $jc);
                    if ($jt !== $t || ($r[$jcol] ?? null) === null) continue;
                    if (!isset($this->json[$jc])) throw new BusinessException("json $jc", 'import_unmapped', 422, ['what' => $jc]);
                    $json[$jcol] = json_decode($r[$jcol], true);
                }
                $new = DB::table($t)->insertGetId($r);
                $ids[$t][$oldId] = $new;
                foreach ($pending as [$col, $target, $old]) $later[] = [$t, $new, $col, $target, $old];
                foreach ($json as $jcol => $v) $jsonLater[] = [$t, $new, $jcol, $v];
            }
        }
        foreach ($later as [$t, $new, $col, $target, $old]) {
            $to = $ids[$target][$old] ?? throw new BusinessException("ref $t.$col", 'import_unmapped', 422, ['what' => "$t.$col -> $target#$old"]);
            DB::table($t)->where('institution_id', $i->id)->where('id', $new)->update([$col => $to]);
        }
        $id = function (string $table, $old) use (&$ids) {
            if ($old === null) return null;
            return $ids[$table][$old] ?? throw new BusinessException("json ref $table", 'import_unmapped', 422, ['what' => "$table#$old"]);
        };
        foreach ($jsonLater as [$t, $new, $col, $v]) {
            DB::table($t)->where('institution_id', $i->id)->where('id', $new)->update([$col => json_encode(($this->json["$t.$col"])($v, $id), JSON_UNESCAPED_UNICODE)]);
        }
    }
}
