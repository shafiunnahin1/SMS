<?php

namespace App\Http\Controllers\Export;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Institution, TenantExport};
use App\Services\Export\{TenantExporter, TenantImporter};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

// D193 EXP.1 (platform-ops.md section 5, D38): the Super Admin (central host) backs an institution up - a reason, the Super
// Admin's own passphrase, never the payroll group (D33) - and restores an export or backup as a NEW institution (a new slug;
// nothing that exists is touched). The backup file stays on the platform until it expires (exports:prune).
class SuperExportController extends Controller
{
    public function backup(Request $request, int $id, TenantExporter $exporter)
    {
        $d = $request->validate(['reason' => 'required|string|min:5|max:255', 'passphrase' => 'required|string|min:12|max:200|confirmed']);
        $i = Institution::findOrFail($id);
        $export = Tenancy::as($i, function () use ($request, $d, $exporter) {
            $e = TenantExport::create(['kind' => 'backup', 'status' => 'queued', 'requested_by' => $request->user()->id]);
            AuditLog::record('tenant.backup_requested', $e, ['reason' => $d['reason']]);
            return $exporter->build($e, $d['passphrase']);
        });
        return response()->json(['success' => true, 'data' => ['id' => $export->id, 'status' => $export->status, 'tables_count' => $export->tables_count,
            'rows_count' => $export->rows_count, 'expires_at' => $export->expires_at?->toIso8601String()]], 201);
    }

    /** { export_id | file, new_slug, passphrase, status: trial|active } */
    public function import(Request $request, TenantImporter $importer)
    {
        $d = $request->validate(['export_id' => 'required_without:file|nullable|integer', 'file' => 'required_without:export_id|nullable|file|max:512000',
            'new_slug' => ['required', 'string', 'max:60', 'regex:/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/'], 'passphrase' => 'required|string|max:200',
            'status' => 'required|in:trial,active']);
        if (!empty($d['export_id'])) {
            $e = TenantExport::anyInstitution()->whereKey($d['export_id'])->where('status', 'ready')->first() ?? throw new BusinessException('gone', 'export_gone', 410);
            $path = Storage::disk('private')->path($e->file_path);
        } else {
            $path = $request->file('file')->getRealPath();
        }
        $i = $importer->import($path, $d['passphrase'], $d['new_slug'], $d['status'], $request->user()->id, $d['export_id'] ?? null);
        return response()->json(['success' => true, 'data' => ['id' => $i->id, 'slug' => $i->slug, 'name' => $i->name, 'status' => $i->status]], 201);
    }
}
