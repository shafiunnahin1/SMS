<?php

namespace App\Http\Controllers\CashBook;

use App\Exports\CashBookSheetExport;
use App\Http\Controllers\Controller;
use App\Http\Requests\CashBook\CashBookRequest;
use App\Http\Resources\CashBookClosingResource;
use App\Services\{CashBookService, PdfService};
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;

class CashBookController extends Controller
{
    public function __construct(private CashBookService $cashbook) {}
    private function day(array $day): array
    {
        $day['history'] = CashBookClosingResource::collection($day['history']);
        return $day;
    }
    public function show(CashBookRequest $request)
    {
        $input = $request->validated();
        return response()->json(['success' => true, 'data' => $this->day($this->cashbook->show($input['date'], isset($input['opening_cash']) ? (string) $input['opening_cash'] : null))]);
    }
    public function range(CashBookRequest $request)
    {
        $input = $request->validated();
        return response()->json(['success' => true, 'data' => array_map(fn ($day) => $this->day($day), $this->cashbook->range($input['from'], $input['to']))]);
    }
    public function close(CashBookRequest $request, string $date)
    {
        return (new CashBookClosingResource($this->cashbook->close($date, $request->validated(), $request->user()->id)))->response()->setStatusCode(201);
    }
    public function reopen(CashBookRequest $request, string $date)
    {
        return (new CashBookClosingResource($this->cashbook->reopen($date, $request->validated()['reason'], $request->user()->id)))->response()->setStatusCode(201);
    }
    public function report(CashBookRequest $request, string $date, string $ext, PdfService $pdf)
    {
        if (!in_array($ext, ['pdf', 'xlsx'], true)) throw ValidationException::withMessages(['ext' => __('validation.in', ['attribute' => 'ext'])]);
        $day = $this->cashbook->show($date);
        $columns = array_map(fn ($key) => __('pdf.cashbook.' . $key), ['section', 'item', 'income', 'outflow']);
        $rows = [];
        foreach ($day['methods'] as $row) $rows[] = [__('pdf.cashbook.method'), $row['method'], $row['in'], $row['out']];
        foreach ($day['income_categories'] as $row) $rows[] = [__('pdf.cashbook.category'), (string) $row['fee_category_id'], $row['amount'], ''];
        foreach ($day['expense_categories'] as $row) $rows[] = [__('pdf.cashbook.category'), $row['category'], '', $row['amount']];
        foreach ($day['collectors'] as $row) $rows[] = [__('pdf.cashbook.collector'), (string) $row['collected_by'], $row['amount'], ''];
        foreach (['opening_cash', 'expected_closing', 'status'] as $key) $rows[] = [__('pdf.cashbook.summary'), __('pdf.cashbook.' . $key), $day[$key], ''];
        foreach ($day['history'] as $row) {
            $rows[] = [__('pdf.cashbook.history'), $row->revision . ': ' . $row->status, $row->counted_cash, $row->difference];
        }
        $total = [__('pdf.cashbook.cash'), '', $day['cash_in'], $day['cash_out']];
        if ($ext === 'xlsx') return Excel::download(new CashBookSheetExport($columns, [...$rows, $total]), 'cashbook-' . $date . '.xlsx');
        $report = ['title' => __('pdf.cashbook.title'), 'filters' => $date, 'headings' => $columns, 'rows' => $rows, 'total' => $total];
        return response($pdf->render('pdf.report', ['report' => $report], 'a4', 'portrait'), 200,
            ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="cashbook-' . $date . '.pdf"']);
    }
}
