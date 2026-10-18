<?php

namespace App\Http\Controllers\Reports;

use App\Exports\SimpleSheetExport;
use App\Http\Controllers\Controller;
use App\Services\{PdfService, ReportService};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Maatwebsite\Excel\Facades\Excel;

// Step 4.8: GET /admin/reports/{type} (class list, attendance, due list, collection) and GET /accountant/reports/{type}
// (the money ones) - ?format=pdf (default) or xlsx. Unknown type -> 404.
class ReportController extends Controller
{
    public function __construct(private ReportService $reports) {}

    public function generate(Request $request, string $type, PdfService $pdf)
    {
        return $this->respond($request, $type, ReportService::ADMIN, $pdf);
    }

    public function financial(Request $request, string $type, PdfService $pdf)
    {
        // D101: department staff need D91 context + the per-type key (staff.report.dues / staff.report.fees); unknown types fail closed
        if ($request->user()?->role === 'institution_staff') app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
        return $this->respond($request, $type, ReportService::ACCOUNTANT, $pdf);
    }

    private function respond(Request $request, string $type, array $allowed, PdfService $pdf)
    {
        abort_unless(in_array($type, $allowed, true), 404);
        $tenant = Tenancy::current()->id;
        $f = $request->validate([
            'format' => 'nullable|in:pdf,xlsx',
            'program_id' => ['nullable', 'integer', Rule::exists('programs', 'id')->where('institution_id', $tenant)],
            'batch_id' => [in_array($type, ['attendance'], true) ? 'required' : 'nullable', 'integer', Rule::exists('batches', 'id')->where('institution_id', $tenant)],
            'month' => [in_array($type, ['attendance', 'fees'], true) ? 'required' : 'nullable', 'date_format:Y-m'],
            'fee_category_id' => ['nullable', 'integer', Rule::exists('fee_categories', 'id')->where('institution_id', $tenant)],
        ]);
        if ($type === 'dues' && empty($f['program_id']) && empty($f['batch_id'])) {
            abort(response()->json(['success' => false, 'error' => 'validation_error', 'message' => __('validation.required', ['attribute' => term('batch')]),
                'errors' => ['batch_id' => [__('validation.required', ['attribute' => term('batch')])]]], 422));   // a due list is per program or batch
        }
        $report = $this->reports->build($type, $f);
        $name = $type . '-' . now()->format('Ymd');

        if (($f['format'] ?? 'pdf') === 'xlsx') {
            $rows = $report['rows'];
            if (!empty($report['total'])) $rows[] = $report['total'];
            return Excel::download(new SimpleSheetExport($report['headings'], $rows, mb_substr($report['title'], 0, 31)), $name . '.xlsx');
        }
        return response($pdf->render('pdf.report', ['report' => $report], 'a4', !empty($report['landscape']) ? 'landscape' : 'portrait'), 200, [
            'Content-Type' => 'application/pdf', 'Content-Disposition' => 'inline; filename="' . $name . '.pdf"',
        ]);
    }
}
