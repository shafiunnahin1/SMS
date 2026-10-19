<?php

namespace App\Http\Controllers\QuestionBank;

use App\Http\Controllers\Controller;
use App\Http\Requests\QuestionBank\StoreQbOmrScanBatchRequest;
use App\Http\Resources\QbOmrFormResource;
use App\Services\QuestionBank\QbOmrGeometryService;
use App\Services\QuestionBank\QbOmrFormService;
use App\Services\QuestionBank\QbOmrScanService;
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
            'settings.info_boxes' => 'required|array:class,roll,subject,set',
            'settings.info_boxes.class' => 'required|boolean',
            'settings.info_boxes.roll' => 'required|boolean',
            'settings.info_boxes.subject' => 'required|boolean',
            'settings.info_boxes.set' => 'required|boolean',
            'settings.page_size' => 'required|in:a5,a4,legal',
            'settings.page_orientation' => 'required|in:portrait,landscape',
            'settings.answer_columns' => ['required', 'string', 'regex:/^(auto|[1-9][0-9]?)$/'],
            'settings.question_mark' => ['required', 'regex:/^\d{1,6}(\.\d{1,2})?$/'],
            'settings.negative_mark_enabled' => 'required|boolean',
            'settings.negative_mark' => ['required', 'regex:/^\d{1,6}(\.\d{1,2})?$/'],
            'settings.multiple_answer_policy' => 'required|in:wrong,correct_if_any',
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
        $validated = $request->validate(['set' => 'nullable|string|max:10']);
        $sheet = $service->printData($request->user(), $id, $validated['set'] ?? null);
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
}