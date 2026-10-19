<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, QbImportBatch, QbImportRecord};
use App\Services\QbImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

// D123 (R2.1.3): qbank's JSON import page, with TOON - upload (files or pasted text), watch the staging, list the staged records
// with their field-path errors, download the error report, resume a stalled batch. Writers see their own batches; the Super
// Admin all. Nothing here writes a question.
class QbImportController extends Controller
{
    public function __construct(private QbImportService $imports) {}

    /** GET /writer/imports */
    public function index(Request $request): JsonResponse
    {
        $rows = $this->visible($request)->latest('id')->limit(50)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($b) => $this->view($b))->values()]);
    }

    /** POST /writer/imports {files[]} | {text, format?} */
    public function store(Request $request): JsonResponse
    {
        $kb = (int) config('qb_import.max_file_kb');
        $in = $request->validate([
            'files' => ['required_without:text', 'array', 'max:' . (int) config('qb_import.max_files')],
            'files.*' => ['file', 'max:' . $kb, 'mimetypes:application/json,text/plain,application/octet-stream'],
            'text' => ['required_without:files', 'nullable', 'string', 'max:' . ($kb * 1024)],
            'format' => ['nullable', 'in:json,toon'],
        ]);
        $files = isset($in['files'])
            ? array_map(fn ($f) => ['name' => $f->getClientOriginalName(), 'bytes' => (string) file_get_contents($f->getRealPath())], $in['files'])
            : [['name' => 'pasted.' . ($in['format'] ?? 'json'), 'bytes' => $in['text']]];
        [$batch, $new] = $this->imports->create($request->user(), $files, $in['format'] ?? null);
        if ($new) AuditLog::record('qb.import.created', $batch, ['format' => $batch->format, 'files' => count($batch->files)]);
        return response()->json(['success' => true, 'data' => $this->view($batch->fresh()), 'reused' => !$new], $new ? 201 : 200);
    }

    /** GET /writer/imports/{id} */
    public function show(Request $request, string $uuid): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->view($this->find($request, $uuid))]);
    }

    /** GET /writer/imports/{id}/records?filter=valid|invalid|duplicate&page= */
    public function records(Request $request, string $uuid): JsonResponse
    {
        $batch = $this->find($request, $uuid);
        $f = $request->validate(['filter' => 'nullable|in:valid,invalid,duplicate,imported', 'per_page' => 'nullable|integer|min:1|max:200']);
        $page = QbImportRecord::where('qb_import_batch_id', $batch->id)
            ->when(($f['filter'] ?? null) === 'valid', fn ($q) => $q->whereNull('errors'))
            ->when(($f['filter'] ?? null) === 'invalid', fn ($q) => $q->whereNotNull('errors'))
            ->when(($f['filter'] ?? null) === 'duplicate', fn ($q) => $q->where('duplicate_status', '!=', 'none'))
            ->when(($f['filter'] ?? null) === 'imported', fn ($q) => $q->whereNotNull('qb_question_id'))
            ->orderBy('file_index')->orderBy('record_index')->paginate($f['per_page'] ?? 50);
        return response()->json(['success' => true,
            'data' => collect($page->items())->map(fn ($r) => ['id' => $r->id, 'file' => $batch->files[$r->file_index]['name'] ?? '', 'record' => $r->record_index + 1,
                'type' => $r->type_slug, 'payload' => $r->payload, 'errors' => $r->errors ?? [], 'warnings' => $r->warnings ?? [], 'has_math' => $r->has_math,
                'duplicate_status' => $r->duplicate_status, 'duplicate_question_id' => $r->duplicate_question_id, 'selected' => $r->selected,
                'qb_question_id' => $r->qb_question_id])->values(),
            'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'total' => $page->total(), 'per_page' => $page->perPage()]]);
    }

    /** GET /writer/imports/{id}/errors.csv */
    public function errors(Request $request, string $uuid): Response
    {
        $batch = $this->find($request, $uuid);
        return response($this->imports->errorCsv($batch), 200, ['Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="import-' . $batch->uuid . '-errors.csv"']);
    }

    /** POST /writer/imports/{id}/resume */
    public function resume(Request $request, string $uuid): JsonResponse
    {
        $batch = $this->find($request, $uuid);
        $this->imports->resume($batch);
        return response()->json(['success' => true, 'data' => $this->view($batch->fresh())]);
    }

    private function visible(Request $request)
    {
        return QbImportBatch::query()->when($request->user()->role !== 'super_admin', fn ($q) => $q->where('created_by', $request->user()->id));
    }

    private function find(Request $request, string $uuid): QbImportBatch
    {
        return $this->visible($request)->where('uuid', $uuid)->firstOrFail();
    }

    private function view(QbImportBatch $b): array
    {
        return ['id' => $b->uuid, 'format' => $b->format, 'schema_version' => $b->schema_version, 'files' => $b->files, 'status' => $b->status, 'error' => $b->error,
            'counts' => ['total' => $b->total_records, 'parsed' => $b->parsed_records, 'valid' => $b->valid_records, 'invalid' => $b->invalid_records,
                'duplicate' => $b->duplicate_records, 'imported' => $b->imported_records],
            'created_at' => $b->created_at?->toIso8601String()];
    }
}
