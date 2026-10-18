<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, QbGraphDataset};
use App\Services\QbGraphDatasetService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

// D115 (R2.1.2): qbank's graph-dataset API, in qbank's own response shape (the copied graph tool's dataset client reads it unchanged).
// A writer lists and changes only their own datasets; a moderator reads any (they review the question that uses it) and changes none;
// the Super Admin does both. A dataset attached to a question cannot be deleted; an edit from an older version is a 409.
class QbGraphDatasetController extends Controller
{
    public function __construct(private QbGraphDatasetService $storage) {}

    /** GET /writer/graph-datasets/capabilities */
    public function capabilities(): JsonResponse
    {
        return response()->json(['ok' => true, 'version' => '2.2.1.1', 'ownership' => ['mode' => 'user', 'authenticationRequired' => true, 'browserScoped' => false],
            'limits' => ['maxRows' => QbGraphDataset::MAX_ROWS, 'maxColumns' => QbGraphDataset::MAX_COLUMNS, 'maxCells' => QbGraphDataset::MAX_CELLS, 'maxCellLength' => QbGraphDataset::MAX_CELL_LENGTH],
            'storage' => ['databaseRowLimit' => QbGraphDataset::MAX_ROWS, 'databaseByteLimit' => null, 'largeDatasetDriver' => 'database']]);
    }

    /** GET /writer/graph-datasets?limit= */
    public function index(Request $request): JsonResponse
    {
        $limit = min(100, max(1, (int) $request->integer('limit', 40)));
        $rows = QbGraphDataset::query()->when($request->user()->role === 'content_writer', fn ($q) => $q->where('created_by', $request->user()->id))
            ->latest('updated_at')->limit($limit)->get();
        return response()->json(['ok' => true, 'ownershipMode' => 'user', 'datasets' => $rows->map(fn ($d) => $this->metadata($d))->values()]);
    }

    /** POST /writer/graph-datasets {name?, source_type?, headers, rows, metadata?} */
    public function store(Request $request): JsonResponse
    {
        $in = $this->payload($request);
        try { $d = $this->storage->create($request->user()->id, $in); }
        catch (InvalidArgumentException $e) { throw ValidationException::withMessages(['dataset' => $e->getMessage()]); }
        AuditLog::record('qb.graph_dataset.created', $d, ['rows' => $d->row_count, 'columns' => $d->column_count]);
        return response()->json(['ok' => true, 'ownershipMode' => 'user', 'dataset' => $this->metadata($d)], 201);
    }

    /** GET /writer/graph-datasets/{uuid} */
    public function show(Request $request, string $uuid): JsonResponse
    {
        $d = $this->find($request, $uuid, false);
        return response()->json(['ok' => true, 'ownershipMode' => 'user', 'dataset' => $this->metadata($d) + ['headers' => $d->headers, 'rows' => $this->storage->rows($d)]]);
    }

    /** PUT /writer/graph-datasets/{uuid} {..., version} */
    public function update(Request $request, string $uuid): JsonResponse
    {
        $d = $this->find($request, $uuid, true);
        try { $fresh = $this->storage->update($d, $this->payload($request)); }
        catch (InvalidArgumentException $e) { throw ValidationException::withMessages(['dataset' => $e->getMessage()]); }
        if (!$fresh) return response()->json(['ok' => false, 'message' => __('errors.qb_dataset_version'), 'code' => 'DATASET_VERSION_CONFLICT', 'dataset' => $this->metadata($d->fresh())], 409);
        AuditLog::record('qb.graph_dataset.updated', $fresh, ['version' => $fresh->version]);
        return response()->json(['ok' => true, 'ownershipMode' => 'user', 'dataset' => $this->metadata($fresh)]);
    }

    /** DELETE /writer/graph-datasets/{uuid} */
    public function destroy(Request $request, string $uuid): JsonResponse
    {
        $d = $this->find($request, $uuid, true);
        if ($d->qb_question_id !== null) return response()->json(['ok' => false, 'message' => __('errors.qb_dataset_in_use'), 'code' => 'DATASET_IN_USE'], 409);
        $d->delete();
        AuditLog::record('qb.graph_dataset.deleted', $d, []);
        return response()->json(['ok' => true, 'deleted' => $uuid]);
    }

    private function find(Request $request, string $uuid, bool $write): QbGraphDataset
    {
        $d = QbGraphDataset::where('uuid', $uuid)->firstOrFail();
        $user = $request->user();
        $ok = match ($user->role) {
            'super_admin' => true,
            'content_moderator' => !$write,
            default => (int) $d->created_by === (int) $user->id,
        };
        abort_unless($ok, 403);
        return $d;
    }

    private function payload(Request $request): array
    {
        $v = $request->validate([
            'name' => ['nullable', 'string', 'max:160'], 'source_type' => ['nullable', 'string', 'max:40'],
            'headers' => ['required', 'array', 'min:1', 'max:' . QbGraphDataset::MAX_COLUMNS], 'rows' => ['present', 'array', 'max:' . QbGraphDataset::MAX_ROWS],
            'metadata' => ['nullable', 'array'], 'version' => ['nullable', 'integer', 'min:1'],
        ]);
        return ['name' => (string) ($v['name'] ?? 'Graph dataset'), 'source_type' => (string) ($v['source_type'] ?? 'manual'), 'headers' => array_values($v['headers']),
            'rows' => array_values($v['rows']), 'metadata' => is_array($v['metadata'] ?? null) ? $v['metadata'] : [], 'version' => isset($v['version']) ? (int) $v['version'] : null];
    }

    private function metadata(QbGraphDataset $d): array
    {
        return ['uuid' => $d->uuid, 'name' => $d->name, 'sourceType' => $d->source_type, 'rowCount' => (int) $d->row_count, 'columnCount' => (int) $d->column_count,
            'checksum' => $d->checksum, 'version' => (int) $d->version, 'storageDriver' => 'database', 'questionId' => $d->qb_question_id,
            'inUse' => $d->qb_question_id !== null, 'ownershipMode' => 'user', 'lastUsedAt' => null, 'updatedAt' => $d->updated_at?->toISOString()];
    }
}
