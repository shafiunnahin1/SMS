<?php

namespace App\Http\Controllers\Expenses;

use App\Exports\ExpenseSheetExport;
use App\Http\Controllers\Controller;
use App\Http\Requests\Expenses\{ExpenseRequest, ExpenseQueryRequest};
use App\Http\Resources\ExpenseResource;
use App\Services\{ExpenseService, PdfService};
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class ExpenseController extends Controller
{
    public function __construct(private ExpenseService $expenses) {}
    public function index(ExpenseQueryRequest $request) { return ExpenseResource::collection($this->expenses->listing($request->validated())); }
    public function show(int $id) { return new ExpenseResource($this->expenses->find($id)); }
    public function store(ExpenseRequest $request) { return (new ExpenseResource($this->expenses->create($request->validated(), $request->user()->id)))->response()->setStatusCode(201); }
    public function update(ExpenseRequest $request, int $id) { return new ExpenseResource($this->expenses->correct($id, $request->validated(), $request->user()->id)); }
    public function destroy(Request $request, int $id) { return new ExpenseResource($this->expenses->correct($id, null, $request->user()->id)); }
    public function report(ExpenseQueryRequest $request, PdfService $pdf)
    {
        $filters = $request->validated();
        $report = $this->expenses->report($filters['month'] ?? now()->format('Y-m'));
        $format = $filters['format'] ?? 'json';
        if ($format === 'json') return response()->json(['success' => true, 'data' => ['month' => $report['month'], 'total' => $report['total']]]);
        $name = 'expenses-' . $report['month'];
        if ($format === 'xlsx') return Excel::download(new ExpenseSheetExport($report['table']['headings'], [...$report['table']['rows'], $report['table']['total']]), $name . '.xlsx');
        return response($pdf->render('pdf.report', ['report' => $report['table']], 'a4', 'portrait'), 200,
            ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="' . $name . '.pdf"']);
    }
}
