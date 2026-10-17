<?php

namespace App\Http\Controllers\Inventory;

use App\Exports\ExpenseSheetExport;
use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\InventoryReportRequest;
use App\Http\Resources\InventoryItemResource;
use App\Services\{InventoryService, PdfService};
use Maatwebsite\Excel\Facades\Excel;

class InventoryReportController extends Controller
{
    public function __construct(private InventoryService $inventory) {}
    public function stock(InventoryReportRequest $request) { return InventoryItemResource::collection($this->inventory->stock($request->boolean('low'))); }

    /** GET /inventory/reports/{stock|movements|sales|valuation}?from=&to=&format=json|pdf|xlsx */
    public function show(InventoryReportRequest $request, string $name, PdfService $pdf)
    {
        abort_unless(in_array($name, ['stock', 'movements', 'sales', 'valuation'], true), 404);
        $filters = $request->validated();
        $report = $this->inventory->report($name, $filters);
        $format = $filters['format'] ?? 'json';
        if ($format === 'json') return response()->json(['success' => true, 'data' => ['name' => $name, 'headings' => $report['headings'], 'rows' => $report['rows'], ...$report['summary']]]);
        if ($format === 'xlsx') return Excel::download(new ExpenseSheetExport($report['headings'], [...$report['rows'], $report['total']]), "inventory-{$name}.xlsx");
        return response($pdf->render('pdf.report', ['report' => $report], 'a4', 'portrait'), 200,
            ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="inventory-' . $name . '.pdf"']);
    }

    public function receipt(string $receiptNo, PdfService $pdf)
    {
        $receipt = $this->inventory->receipt($receiptNo);
        return response($pdf->render('pdf.report', ['report' => $receipt], 'a5', 'portrait'), 200,
            ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="' . $receiptNo . '.pdf"']);
    }
}
