<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, QbImportBatch, QbImportRecord};
use App\Services\QbImportService;
use App\Support\QbImportExamples;
use App\Support\Toon\ToonEncoder;
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
        $rows = $this->visible($request)->latest('created_at')->latest('id')->limit(50)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($b) => $this->view($b))->values()]);
    }

    /** POST /writer/imports {files[]} | {text, format?} */
    public function store(Request $request): JsonResponse
    {
        $kb = (int) config('qb_import.max_file_kb');
        $pdf = $request->hasFile('pdf');
        $in = $request->validate($pdf ? [                               // D124: one PDF a batch, with an optional page range
            'pdf' => ['required', 'file', 'mimes:pdf', 'mimetypes:application/pdf', 'max:' . (int) config('qb_import.max_pdf_kb')],
            'page_from' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'page_to' => ['nullable', 'integer', 'min:1', 'max:65535', 'gte:page_from'],
        ] : [
            'files' => ['required_without:text', 'array', 'max:' . (int) config('qb_import.max_files')],
            'files.*' => ['file', 'max:' . $kb, 'mimetypes:application/json,text/plain,application/octet-stream'],
            'text' => ['required_without:files', 'nullable', 'string', 'max:' . ($kb * 1024)],
            'format' => ['nullable', 'in:json,toon'],
        ]);
        if ($pdf && !str_starts_with((string) file_get_contents($in['pdf']->getRealPath(), false, null, 0, 5), '%PDF-')) {
            throw \Illuminate\Validation\ValidationException::withMessages(['pdf' => __('validation.mimes', ['attribute' => 'pdf', 'values' => 'pdf'])]);
        }
        $files = $pdf ? [['name' => $in['pdf']->getClientOriginalName(), 'bytes' => (string) file_get_contents($in['pdf']->getRealPath())]]
            : (isset($in['files'])
                ? array_map(fn ($f) => ['name' => $f->getClientOriginalName(), 'bytes' => (string) file_get_contents($f->getRealPath())], $in['files'])
                : [['name' => 'pasted.' . ($in['format'] ?? 'json'), 'bytes' => $in['text']]]);
        [$batch, $new] = $this->imports->create($request->user(), $files, $pdf ? 'pdf' : ($in['format'] ?? null), $in['page_from'] ?? null, $in['page_to'] ?? null);
        if ($new) AuditLog::record('qb.import.created', $batch, ['format' => $batch->format, 'files' => count($batch->files)]);
        return response()->json(['success' => true, 'data' => $this->view($batch->fresh()), 'reused' => !$new], $new ? 201 : 200);
    }

    /** GET /writer/imports/schema.json: SMS's import schema (qbank's v5 keys plus every type of qb_question_types) */
    public function schema(): JsonResponse
    {
        return response()->json(QbImportExamples::schema(), 200, [], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    }

    /** GET /writer/imports/example.json | example.toon: the same questions in both encodings */
    public function example(string $format): Response
    {
        $data = QbImportExamples::example();
        return $format === 'toon'
            ? response(ToonEncoder::encode($data), 200, ['Content-Type' => 'text/plain; charset=UTF-8'])
            : response(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), 200, ['Content-Type' => 'application/json; charset=UTF-8']);
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
            'data' => collect($page->items())->map(fn ($r) => $this->record($batch, $r))->values(),
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

    /** PATCH /writer/imports/{id}/records/{record}: qbank's quick edit - changes the staged record only */
    public function edit(Request $request, string $uuid, int $record): JsonResponse
    {
        $batch = $this->find($request, $uuid);
        $r = QbImportRecord::where('qb_import_batch_id', $batch->id)->findOrFail($record);
        $this->imports->edit($r, $this->changes($request));
        $this->imports->recount($batch);
        return response()->json(['success' => true, 'data' => $this->record($batch, $r->fresh())]);
    }

    /** POST /writer/imports/{id}/records/{record}/open-editor: D153 creates/reuses one draft without finalizing other selected rows. */
    public function openEditor(Request $request, string $uuid, int $record): JsonResponse
    {
        $batch = $this->find($request, $uuid);
        if ($batch->status !== 'ready') throw new \App\Exceptions\BusinessException('the import is still being read', 'qb_import_not_ready', 422);
        $staged = QbImportRecord::where('qb_import_batch_id', $batch->id)->findOrFail($record);
        $question = $this->imports->openEditorDraft($staged, $request->user());
        $this->imports->recount($batch);
        AuditLog::record('qb.import.editor_draft_opened', $question, ['batch_id' => $batch->id, 'record_id' => $staged->id]);
        return response()->json(['success' => true, 'data' => ['question_id' => $question->id, 'record' => $this->record($batch, $staged->fresh())]]);
    }

    /** POST /writer/imports/{id}/settings {record_ids[] | selected: true, changes{...}}: qbank's bulk settings */
    public function settings(Request $request, string $uuid): JsonResponse
    {
        $batch = $this->find($request, $uuid);
        $in = $request->validate(['record_ids' => 'required_without:selected|array|max:1000', 'record_ids.*' => 'integer', 'selected' => 'nullable|boolean']);
        $changes = $this->changes($request, 'changes.');
        $rows = QbImportRecord::where('qb_import_batch_id', $batch->id)->whereNull('qb_question_id')
            ->when(array_key_exists('source_occurrence', $changes), fn ($q) => $q->where('selected', true)->whereNull('errors'))
            ->when(isset($in['record_ids']), fn ($q) => $q->whereIn('id', $in['record_ids']), fn ($q) => $q->where('selected', true))->get();
        foreach ($rows as $r) $this->imports->edit($r, $changes);
        $this->imports->recount($batch);
        return response()->json(['success' => true, 'data' => $this->view($batch->fresh()), 'changed' => $rows->count()]);
    }

    /** POST /writer/imports/{id}/select {record_ids[] | all_valid: true, selected} - an invalid record cannot be selected */
    public function select(Request $request, string $uuid): JsonResponse
    {
        $batch = $this->find($request, $uuid);
        $in = $request->validate(['record_ids' => 'required_without:all_valid|array|max:1000', 'record_ids.*' => 'integer', 'all_valid' => 'nullable|boolean', 'selected' => 'required|boolean']);
        $changed = QbImportRecord::where('qb_import_batch_id', $batch->id)->whereNull('qb_question_id')
            ->when(isset($in['record_ids']), fn ($q) => $q->whereIn('id', $in['record_ids']))
            ->when($in['selected'], fn ($q) => $q->whereNull('errors'))
            ->update(['selected' => $in['selected']]);
        return response()->json(['success' => true, 'changed' => $changed]);
    }

    /** POST /writer/imports/{id}/records/{record}/duplicate {choice: skip|import}: a possible duplicate needs a person's choice */
    public function duplicate(Request $request, string $uuid, int $record): JsonResponse
    {
        $batch = $this->find($request, $uuid);
        $in = $request->validate(['choice' => 'required|in:skip,import']);
        $r = QbImportRecord::where('qb_import_batch_id', $batch->id)->whereNull('qb_question_id')->where('duplicate_status', '!=', 'none')->findOrFail($record);
        $r->update(['duplicate_status' => $in['choice']]);
        return response()->json(['success' => true, 'data' => $this->record($batch, $r)]);
    }

    /** POST /writer/imports/{id}/finalize: "import selected" - only selected, valid records, each as a draft of the importing writer */
    public function finalize(Request $request, string $uuid): JsonResponse
    {
        $batch = $this->find($request, $uuid);
        if ($batch->status !== 'ready') throw new \App\Exceptions\BusinessException('the import is still being read', 'qb_import_not_ready', 422);
        $result = $this->imports->finalize($batch, $request->user());
        AuditLog::record('qb.import.finalized', $batch, $result);
        return response()->json(['success' => true, 'data' => $this->view($batch->fresh()), 'result' => $result]);
    }

    /** POST /writer/imports/{id}/records/{record}/reject {rejected}: D124 - a staged question the reviewer throws out stays listed, greyed, and can never be imported */
    public function reject(Request $request, string $uuid, int $record): JsonResponse
    {
        $batch = $this->find($request, $uuid);
        $in = $request->validate(['rejected' => 'required|boolean']);
        $r = QbImportRecord::where('qb_import_batch_id', $batch->id)->whereNull('qb_question_id')->findOrFail($record);
        $this->imports->reject($r, $in['rejected']);
        $this->imports->recount($batch);
        return response()->json(['success' => true, 'data' => $this->record($batch, $r->fresh())]);
    }

    /** GET /writer/imports/{id}/source.pdf: D124 - the uploaded PDF, so the reviewer can compare a question with its page */
    public function source(Request $request, string $uuid): Response
    {
        $batch = $this->find($request, $uuid);
        abort_unless($batch->format === 'pdf', 404);
        return response($this->imports->sourceBytes($batch), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="source.pdf"',
            'X-Content-Type-Options' => 'nosniff']);
    }

    /** the editable fields of a staged record, shape-checked (the normalizer checks the content as on upload) */
    private function changes(Request $request, string $prefix = ''): array
    {
        $ref = ['nullable'];
        $in = $request->validate([
            $prefix . 'type' => 'sometimes|string|max:100',
            $prefix . 'question_text' => 'sometimes|string|max:20000',
            $prefix . 'answer_text' => 'sometimes|nullable|string|max:20000',
            $prefix . 'explanation_text' => 'sometimes|nullable|string|max:20000',
            $prefix . 'language' => 'sometimes|in:bn,en,und',
            $prefix . 'difficulty' => 'sometimes|integer|min:1|max:5',
            $prefix . 'marks' => 'sometimes|nullable|numeric|min:0|max:100',
            $prefix . 'subject' => ['sometimes', ...$ref], $prefix . 'chapter' => ['sometimes', ...$ref], $prefix . 'topic' => ['sometimes', ...$ref],
            $prefix . 'class_levels' => 'sometimes|array|max:30',
            $prefix . 'curriculum_node_ids' => 'sometimes|array|max:30', $prefix . 'curriculum_node_ids.*' => 'integer|distinct|exists:qb_curriculum_nodes,id',
            $prefix . 'options' => 'sometimes|array|max:8', $prefix . 'creative_parts' => 'sometimes|array|max:4',
            $prefix . 'stimuli' => 'sometimes|array|max:5', $prefix . 'items' => 'sometimes|array|max:40', $prefix . 'occurrences' => 'sometimes|array|max:20',
            $prefix . 'source_occurrence' => 'sometimes|array',
        ]);
        $changes = $prefix === '' ? $in : ($in['changes'] ?? []);
        foreach (['subject', 'chapter', 'topic'] as $k) {
            if (array_key_exists($k, $changes) && is_numeric($changes[$k])) $changes[$k] = ['id' => (int) $changes[$k]];
        }
        if (isset($changes['class_levels'])) $changes['class_levels'] = array_map(fn ($c) => is_numeric($c) ? ['id' => (int) $c] : $c, $changes['class_levels']);
        if ($changes === []) throw \Illuminate\Validation\ValidationException::withMessages(['changes' => __('errors.qb_import_nothing_changed')]);
        return $changes;
    }

    private function record(QbImportBatch $batch, QbImportRecord $r): array
    {
        $payload = $r->payload ?? [];
        unset($payload['source_occurrence_indexes']);
        return ['id' => $r->id, 'file' => $batch->files[$r->file_index]['name'] ?? '', 'record' => $r->record_index + 1, 'page' => $r->page_number,
            'type' => $r->type_slug, 'payload' => $payload, 'errors' => $r->errors ?? [], 'warnings' => $r->warnings ?? [], 'has_math' => $r->has_math,
            'duplicate_status' => $r->duplicate_status, 'duplicate_question_id' => $r->duplicate_question_id, 'selected' => $r->selected,
            'qb_question_id' => $r->qb_question_id];
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
            'pdf' => $b->format === 'pdf' ? ['page_from' => $b->page_from, 'page_to' => $b->page_to, 'document_kind' => $b->document_kind, 'unreadable_pages' => $b->unreadable_pages ?? []] : null,
            'created_at' => $b->created_at?->toIso8601String()];
    }
}
