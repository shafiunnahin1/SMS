<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionBank\QbResourceRequest;
use App\Models\{QbMedia, QbResource, User};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Validation\ValidationException;

// QB.5 (D65, docs/modules/question-bank.md §3গ, §5): slides, books and PDFs in the writers' panel. The file is always a PDF on the
// platform's PRIVATE disk (platform/qb/...), shown to the panel through 10-minute signed links; it is filed under exactly one of
// subject / chapter / topic; the preview pages are pictures (the first pages) - made by the server from the PDF (D68, poppler) or uploaded by the writer - which any institution may see.
// Reviewed like a question (ReviewsQbContent). Institutions read published resources through QbLibraryController.
class QbResourceController extends Controller
{
    use ReviewsQbContent;

    public const MAX_KB = 51200;    // 50 MB

    private const MODEL = QbResource::class;
    private const AUDIT = 'qb.resource';

    /** POST /writer/resource-files {file}: a PDF; returns its id and the page count read from it (null when it cannot be read) */
    public function upload(Request $request)
    {
        $f = $request->validate(['file' => ['required', 'file', 'mimes:pdf', 'mimetypes:application/pdf', 'max:' . self::MAX_KB]]);
        if (file_get_contents($f['file']->getRealPath(), false, null, 0, 5) !== '%PDF-') throw ValidationException::withMessages(['file' => __('errors.qb_not_a_pdf')]);
        $path = Storage::disk('private')->putFile('platform/qb/' . now()->format('Y/m'), $f['file']);
        $media = QbMedia::create(['path' => $path, 'mime' => 'application/pdf', 'size_bytes' => $f['file']->getSize(), 'uploaded_by' => $request->user()->id]);
        $previews = array_map(fn ($m) => QbMediaController::view($m), self::renderPreviews($f['file']->getRealPath(), $request->user()->id));
        return response()->json(['success' => true, 'data' => QbMediaController::view($media) + ['page_count' => self::pages($f['file']->getRealPath()), 'previews' => $previews]], 201);
    }

    public const PREVIEW_PAGES = 3;

    /** D68 (2): the first pages as PNG pictures, made by poppler's pdftoppm on the server - at most PREVIEW_PAGES pages, 1000 px on the
     *  long side, 30 s; none when pdftoppm is missing or fails (the writer can still upload pictures by hand). */
    public static function renderPreviews(string $pdf, int $by): array
    {
        $tmp = sys_get_temp_dir() . '/qbprev-' . bin2hex(random_bytes(6));
        try {
            $run = \Illuminate\Support\Facades\Process::timeout(30)->run(['pdftoppm', '-png', '-f', '1', '-l', (string) self::PREVIEW_PAGES, '-scale-to', '1000', $pdf, $tmp]);
            if (!$run->successful()) return [];
            $files = glob($tmp . '-*.png') ?: [];
            sort($files, SORT_NATURAL);
            return array_map(function ($file) use ($by) {
                $path = Storage::disk('private')->putFile('platform/qb/' . now()->format('Y/m'), new \Illuminate\Http\File($file));
                return QbMedia::create(['path' => $path, 'mime' => 'image/png', 'size_bytes' => filesize($file), 'uploaded_by' => $by]);
            }, array_slice($files, 0, self::PREVIEW_PAGES));
        } catch (\Throwable) {
            return [];
        } finally {
            foreach (glob($tmp . '-*.png') ?: [] as $file) @unlink($file);
        }
    }

    /** The page objects of a PDF (`/Type /Page`, not `/Pages`); null when they are packed in compressed object streams - the writer then types it */
    public static function pages(string $file): ?int
    {
        $n = preg_match_all('#/Type\s*/Page(?![A-Za-z])#', (string) file_get_contents($file));
        return $n > 0 ? $n : null;
    }

    /** GET /writer/resources?status=&q=: a writer's own; moderators and the Super Admin see all */
    public function index(Request $request)
    {
        return response()->json($this->page($this->visible($request->user()), $request,
            ['id', 'kind', 'title_bn', 'title_en', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'page_count', 'status', 'review_note', 'created_by']));
    }

    /** POST /writer/resources: a new draft (writers and the Super Admin) */
    public function store(QbResourceRequest $request)
    {
        $user = $request->user();
        abort_if($user->role === 'content_moderator', 403);
        $in = $this->scoped($request->validated());
        $r = DB::transaction(function () use ($in, $user) {
            $this->pdf($in['qb_media_id'], null, $user);
            $r = QbResource::create(collect($in)->except('preview_media_ids')->all() + ['status' => 'draft', 'created_by' => $user->id]);
            $this->previews($r, $in, $user);
            return $r;
        });
        return response()->json(['success' => true, 'data' => $this->row($r->fresh()), 'message' => __('messages.saved')], 201);
    }

    /** GET /writer/resources/{id}: with a signed link to the PDF (the moderator reads it before publishing) */
    public function show(Request $request, int $id)
    {
        return response()->json(['success' => true, 'data' => $this->row($this->find($request->user(), $id))]);
    }

    /** PUT /writer/resources/{id}: the writer, only while draft or rejected; the Super Admin at any time */
    public function update(QbResourceRequest $request, int $id)
    {
        $user = $request->user();
        $in = $request->validated();
        $r = DB::transaction(function () use ($user, $id, $in) {
            $r = $this->editable($user, $id);
            $scope = array_intersect_key($in, array_flip(['qb_subject_id', 'qb_chapter_id', 'qb_topic_id']));
            $in = $scope ? $this->scoped($in) : $in;                 // a new place replaces the old one whole
            if (isset($in['qb_media_id'])) $this->pdf($in['qb_media_id'], $r->qb_media_id, $user);
            $r->update(collect($in)->except('preview_media_ids')->all());
            $this->previews($r, $in, $user);
            return $r;
        });
        return response()->json(['success' => true, 'data' => $this->row($r->fresh()), 'message' => __('messages.saved')]);
    }

    /** Exactly one place: subject, chapter or topic (spec §3গ); the other two are cleared */
    private function scoped(array $in): array
    {
        $given = array_filter(['qb_subject_id' => $in['qb_subject_id'] ?? null, 'qb_chapter_id' => $in['qb_chapter_id'] ?? null, 'qb_topic_id' => $in['qb_topic_id'] ?? null]);
        if (count($given) !== 1) throw ValidationException::withMessages(['qb_subject_id' => __('errors.qb_one_place')]);
        return array_merge($in, ['qb_subject_id' => null, 'qb_chapter_id' => null, 'qb_topic_id' => null], $given);
    }

    /** The file must be a PDF upload, the editor's own (or already this resource's) */
    private function pdf(int $mediaId, ?int $current, User $user): void
    {
        $m = QbMedia::findOrFail($mediaId);
        if ($m->mime !== 'application/pdf') throw ValidationException::withMessages(['qb_media_id' => __('errors.qb_not_a_pdf')]);
        if ($mediaId !== $current && $m->uploaded_by !== $user->id && $user->role !== 'super_admin') {
            throw ValidationException::withMessages(['qb_media_id' => __('errors.qb_media_not_yours')]);
        }
    }

    /** The preview pages, in the order given: pictures (not the PDF), the editor's own uploads */
    private function previews(QbResource $r, array $in, User $user): void
    {
        if (!array_key_exists('preview_media_ids', $in)) return;
        $ids = $in['preview_media_ids'];
        if (QbMedia::whereIn('id', $ids)->where('mime', 'not like', 'image/%')->exists()) throw ValidationException::withMessages(['preview_media_ids' => __('errors.qb_preview_pictures')]);
        $this->ownMedia($ids, $r->previews()->pluck('qb_media.id')->all(), $user, 'preview_media_ids');
        $r->previews()->detach();
        foreach ($ids as $id) $r->previews()->attach($id);                  // one by one: the link id keeps the page order
    }

    private function row(QbResource $r): array
    {
        return $r->only(['id', 'kind', 'title_bn', 'title_en', 'qb_subject_id', 'qb_chapter_id', 'qb_topic_id', 'qb_media_id', 'page_count', 'status', 'review_note', 'created_by', 'reviewed_by'])
            + ['updated_at' => $r->updated_at?->toIso8601String(), 'file' => $r->file ? QbMediaController::view($r->file) : null,
                'preview_media_ids' => $r->previews()->pluck('qb_media.id')->all(),
                'previews' => $r->previews()->get()->map(fn ($m) => QbMediaController::view($m))->values()->all()];
    }
}
