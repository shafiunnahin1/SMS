<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionBank\StoreQbOmrScanBatchRequest;
use App\Http\Resources\QbOmrFormResource;
use App\Services\QuestionBank\QbOmrGeometryService;
use App\Services\QuestionBank\QbOmrFormService;
use App\Services\QuestionBank\QbOmrScanService;
use App\Services\QuestionBank\QbOmrReviewService;
use App\Http\Resources\QbOmrScanResource;
use App\Models\QbOmrScan;
use Illuminate\Support\Facades\Storage;
use App\Services\PdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class QbOmrFormController extends Controller
{
    public function show(Request $request, int $id, QbOmrFormService $service): QbOmrFormResource
    {
        $paper = $service->paper($request->user(), $id);
        return new QbOmrFormResource($service->form($paper));
    }

    public function save(Request $request, int $id, QbOmrFormService $service): QbOmrFormResource
    {
        $paper = $service->paper($request->user(), $id);
        $validated = $request->validate([
            'settings' => 'required|array',
            'settings.title' => 'required|string|max:200',
            'settings.roll_digits' => 'required|integer|min:1|max:12',
            'settings.option_count' => 'required|integer|min:2|max:5',
            'settings.option_language' => 'required|in:bangla,latin',
            'settings.info_boxes' => 'required|array:class,roll,student_id,subject,set',   // D159 (4): student_id replaces subject (old key still read)
            'settings.info_boxes.class' => 'required|boolean',
            'settings.info_boxes.roll' => 'required|boolean',
            'settings.info_boxes.student_id' => 'required_without:settings.info_boxes.subject|boolean',
            'settings.info_boxes.subject' => 'required_without:settings.info_boxes.student_id|boolean',
            'settings.info_boxes.set' => 'required|boolean',
            'settings.page_size' => 'required|in:a5,a4,legal',
            'settings.page_orientation' => 'required|in:portrait,landscape',
            'settings.answer_columns' => ['required', 'string', 'regex:/^(auto|[1-9][0-9]?)$/'],
            'settings.question_mark' => ['required', 'regex:/^\d{1,6}(\.\d{1,2})?$/'],
            'settings.negative_mark_enabled' => 'required|boolean',
            'settings.negative_mark' => ['required', 'regex:/^\d{1,6}(\.\d{1,2})?$/'],
            'settings.multiple_answer_policy' => 'required|in:wrong,correct_if_any',
            // D133 / D110: qbank's OMR controller - subtitle and title sizes, web font, theme colour, digital/manual candidate info,
            // and each candidate code's digit count (all optional so older clients keep working)
            'settings.subtitle' => 'nullable|string|max:200',
            'settings.title_size' => 'nullable|integer|min:12|max:32',
            'settings.subtitle_size' => 'nullable|integer|min:10|max:24',
            'settings.font' => 'nullable|in:' . implode(',', array_keys(QbOmrFormService::FONTS)),
            'settings.theme_color' => 'nullable|in:' . implode(',', array_keys(QbOmrFormService::COLORS)),
            'settings.entry_mode' => 'nullable|in:digital,manual',
            'settings.digits' => 'nullable|array:class,subject,set',
            'settings.digits.class' => 'nullable|integer|min:1|max:3',
            'settings.digits.subject' => 'nullable|integer|min:1|max:4',
            'settings.digits.set' => 'nullable|integer|min:1|max:4',
        ]);

        return new QbOmrFormResource($service->save($paper, $validated['settings']));
    }

    public function generate(Request $request, int $id, QbOmrFormService $service, QbOmrGeometryService $geometry): QbOmrFormResource
    {
        return new QbOmrFormResource($service->generate($request->user(), $id, $geometry));
    }

    public function unlock(Request $request, int $id, QbOmrFormService $service): QbOmrFormResource
    {
        return new QbOmrFormResource($service->unlock($request->user(), $id));
    }

    public function pdf(Request $request, int $id, QbOmrFormService $service, PdfService $pdf)
    {
        $validated = $request->validate(['set' => 'nullable|string|max:10', 'preview' => 'nullable|boolean']);
        $sheet = $service->printData($request->user(), $id, $validated['set'] ?? null, (bool) ($validated['preview'] ?? false));
        $settings = $sheet['settings'];
        $bytes = $pdf->renderOmr('pdf.qb-omr-sheet', $sheet, $settings['page_size'], $settings['page_orientation']);

        return response($bytes, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Length' => (string) strlen($bytes),
            'Content-Disposition' => 'inline; filename="omr-' . $sheet['form']->code . '-' . $sheet['variant']->code . '.pdf"',
        ]);
    }

    public function storeScans(StoreQbOmrScanBatchRequest $request, int $id, QbOmrScanService $service): JsonResponse
    {
        return response()->json(['data' => $service->storeBatch($request->user(), $id, $request->all()['scans'] ?? null)]);
    }

    // D127 (4)/(5): the review queue of a form; every sheet stays reviewable until a person approves or cancels it
    public function scans(Request $request, int $id, QbOmrFormService $forms)
    {
        $paper = $forms->paper($request->user(), $id);
        $form = $forms->form($paper);
        $f = $request->validate(['status' => 'nullable|in:needs_review,graded,cancelled,superseded']);   // results: ?status=graded, any number of sheets, 50 a page
        $rows = QbOmrScan::with('matchedStudent.user:id,name')->where('qb_omr_form_id', $form->id)
            ->when($f['status'] ?? null, fn ($q, $st) => $q->where('status', $st))->orderBy('id')->paginate(50);
        return QbOmrScanResource::collection($rows);
    }

    public function updateScan(Request $request, int $id, QbOmrReviewService $review): QbOmrScanResource
    {
        $review->find($request->user(), $id);               // another tenant's or person's sheet is 404 before validation
        $in = $request->validate([
            'roll' => 'sometimes|nullable|string|max:12',
            'set_code' => 'sometimes|nullable|string|max:10',
            'set_resolution' => 'sometimes|in:main',
            'student_id' => 'sometimes|nullable|integer',
            'answers' => 'sometimes|array|max:500',
            'answers.*.selected' => 'sometimes|array|max:8',
            'answers.*.selected.*' => 'integer|min:0|max:7',
            'answers.*.confirmed' => 'sometimes|boolean',
            'duplicate_decision' => 'sometimes|in:update,keep_both',
        ]);
        return new QbOmrScanResource($review->update($request->user(), $id, $in)->load('matchedStudent.user:id,name'));
    }

    public function approveScan(Request $request, int $id, QbOmrReviewService $review): QbOmrScanResource
    {
        return new QbOmrScanResource($review->approve($request->user(), $id));
    }

    public function cancelScan(Request $request, int $id, QbOmrReviewService $review): QbOmrScanResource
    {
        return new QbOmrScanResource($review->cancel($request->user(), $id));
    }

    // the scanned image stays on the private disk; only the paper's own reviewer can see it
    public function scanImage(Request $request, int $id, QbOmrReviewService $review)
    {
        [, , $row] = $review->find($request->user(), $id);
        abort_unless($row->image_path && Storage::disk('private')->exists($row->image_path), 404);
        return response(Storage::disk('private')->get($row->image_path), 200, [
            'Content-Type' => Storage::disk('private')->mimeType($row->image_path) ?: 'application/octet-stream',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function resultsCsv(Request $request, int $id, QbOmrReviewService $review)
    {
        return response($review->csv($request->user(), $id), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="omr-results-' . $id . '.csv"',
        ]);
    }
}
