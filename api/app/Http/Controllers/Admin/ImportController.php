<?php

namespace App\Http\Controllers\Admin;

use App\Exceptions\BusinessException;
use App\Exports\{SimpleSheetExport, StudentImportTemplate};
use App\Http\Controllers\Controller;
use App\Models\{ImportJob, ImportRow};
use App\Services\ImportService;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

// Step 4.2 (docs/modules/data-migration.md "Endpoint", module data_migration, admin). R1: kind=students only.
class ImportController extends Controller
{
    public function __construct(private ImportService $imports) {}

    public function index()
    {
        $jobs = ImportJob::orderByDesc('id')->limit(50)->get(['id', 'kind', 'status', 'summary', 'created_at', 'finished_at']);
        return response()->json(['success' => true, 'data' => $jobs->map(fn ($j) => $this->job($j))]);
    }

    public function store(Request $request)
    {
        $data = $request->validate(['kind' => 'required|string|max:16', 'file' => 'required|file|max:10240|mimes:csv,txt,xlsx']);
        $job = $this->imports->upload($data['kind'], $request->file('file'), $request->user()->id);
        return response()->json(['success' => true, 'data' => $this->job($job)], 201);
    }

    public function show(Request $request, int $id)
    {
        $job = ImportJob::findOrFail($id);
        $rows = ImportRow::where('job_id', $job->id)->when($request->input('status'), fn ($q, $s) => $q->where('status', $s))
            ->orderBy('row_no')->paginate(min(100, (int) $request->input('per_page', 50)), ['row_no', 'status', 'error', 'data', 'created_id']);
        return response()->json(['success' => true, 'data' => $this->job($job) + ['rows' => $rows->items(), 'rows_meta' => ['page' => $rows->currentPage(), 'last' => $rows->lastPage()]]]);
    }

    public function mapping(Request $request, int $id)
    {
        $job = ImportJob::findOrFail($id);                     // another institution's job is a 404 before any validation message
        $data = $request->validate(['mapping' => 'required|array', 'mapping.*' => 'nullable|string|max:100']);
        return response()->json(['success' => true, 'data' => $this->job($this->imports->map($job, $data['mapping']))]);
    }

    /** POST /imports/{id}/{action}: dry-run | run | rollback */
    public function transition(int $id, string $action)
    {
        $job = ImportJob::findOrFail($id);
        $job = match ($action) {
            'dry-run'  => $this->imports->dryRun($job),
            'run'      => $this->imports->startRun($job),
            'rollback' => $this->imports->rollback($job),
            default    => abort(404),
        };
        return response()->json(['success' => true, 'data' => $this->job($job->fresh())]);
    }

    public function errors(int $id)
    {
        $job = ImportJob::findOrFail($id);
        $fields = array_keys($job->mapping ?? []);
        $rows = ImportRow::where('job_id', $job->id)->where('status', 'error')->orderBy('row_no')->get()
            ->map(fn ($r) => array_merge([$r->row_no, $r->error], array_map(fn ($f) => $r->data[$f] ?? '', $fields)))->all();
        return Excel::download(new SimpleSheetExport(array_merge(['row', 'error'], $fields), $rows, 'Errors'), "import-{$job->id}-errors.xlsx");
    }

    public function template(string $kind)
    {
        if (!in_array($kind, config('release.import_kinds', []), true)) throw new BusinessException('kind', 'kind_not_available', 422);
        return Excel::download(new StudentImportTemplate(), "{$kind}-template.xlsx");
    }

    private function job(ImportJob $j): array
    {
        return ['id' => $j->id, 'kind' => $j->kind, 'status' => $j->status, 'summary' => $j->summary, 'mapping' => $j->mapping,
            'created_at' => $j->created_at?->toIso8601String(), 'finished_at' => $j->finished_at?->toIso8601String(),
            'rollback_until' => $j->status === 'done' ? $j->finished_at?->addDays(7)->toIso8601String() : null];
    }
}
