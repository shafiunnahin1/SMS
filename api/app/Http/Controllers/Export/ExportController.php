<?php

namespace App\Http\Controllers\Export;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, TenantExport};
use App\Services\Export\TenantExporter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Hash, Storage};

// D193 EXP.1 (platform-ops.md section 5.1 / 5.2, D38): the institution admin exports the own data - the password again, a passphrase
// of their own (never stored), salary data only when ticked; one export per 24 hours; the file downloads once, then it is gone, and
// it expires after 24 hours anyway (exports:prune). The file is built in the request, so the passphrase never sits in a queue.
class ExportController extends Controller
{
    public function index()
    {
        return response()->json(['success' => true, 'data' => TenantExport::where('kind', 'export')->orderByDesc('id')->limit(20)->get()->map(fn ($e) => $this->row($e))->values()]);
    }

    public function store(Request $request, TenantExporter $exporter)
    {
        $d = $request->validate(['password' => 'required|string', 'passphrase' => 'required|string|min:12|max:200|confirmed', 'include_payroll' => 'sometimes|boolean']);
        if (!Hash::check($d['password'], $request->user()->password)) throw new BusinessException('password', 'export_password_wrong', 422);
        if (TenantExport::where('kind', 'export')->where('created_at', '>=', now()->subDay())->whereIn('status', ['queued', 'running', 'ready', 'expired'])->count() >= (int) config('tenant_export.per_day')) {
            throw new BusinessException('rate', 'export_once_a_day', 429);
        }
        $export = TenantExport::create(['kind' => 'export', 'status' => 'queued', 'requested_by' => $request->user()->id]);
        AuditLog::record('tenant.export_requested', $export, ['payroll' => (bool) ($d['include_payroll'] ?? false)]);
        $export = $exporter->build($export, $d['passphrase'], (bool) ($d['include_payroll'] ?? false));
        return response()->json(['success' => true, 'data' => $this->row($export)], 201);
    }

    public function show(int $id)
    {
        return response()->json(['success' => true, 'data' => $this->row(TenantExport::where('kind', 'export')->findOrFail($id))]);
    }

    /** Once: the file is streamed and deleted; a second call is 410 */
    public function download(Request $request, int $id)
    {
        $e = TenantExport::where('kind', 'export')->findOrFail($id);
        if ($e->status !== 'ready' || !$e->file_path || $e->expires_at?->isPast()) throw new BusinessException('gone', 'export_gone', 410);
        $path = $e->file_path;
        $bytes = Storage::disk('private')->get($path);
        Storage::disk('private')->delete($path);
        $e->update(['status' => 'expired', 'file_path' => null]);
        AuditLog::record('tenant.export_downloaded', $e, []);
        return response($bytes, 200, ['Content-Type' => 'application/octet-stream',
            'Content-Disposition' => 'attachment; filename="export-' . $e->id . '.edux"', 'Cache-Control' => 'no-store']);
    }

    private function row(TenantExport $e): array
    {
        return ['id' => $e->id, 'kind' => $e->kind, 'status' => $e->status, 'tables_count' => $e->tables_count, 'rows_count' => $e->rows_count,
            'size_bytes' => $e->size_bytes, 'checksum' => $e->checksum, 'error' => $e->error, 'created_at' => $e->created_at?->toIso8601String(),
            'expires_at' => $e->expires_at?->toIso8601String()];
    }
}
