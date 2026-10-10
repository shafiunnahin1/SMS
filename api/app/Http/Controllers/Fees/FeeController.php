<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Http\Requests\Fees\{CollectFeeRequest, FeeCategoryRequest};
use App\Http\Resources\FeeCategoryResource;
use App\Models\{Batch, FeeCategory, FeePayment, ParentStudent, Student};
use App\Services\{DomainService, FeeService, PdfService};
use App\Support\Tenancy;
use Endroid\QrCode\QrCode;
use Endroid\QrCode\Writer\SvgWriter;
use App\Support\Money;
use Illuminate\Http\Request;

// Step 4.4 routes; the walking-skeleton slice (Spike S4/S6) builds dues, collect, receipt, studentPayments and /parent/fees.
// A parent only ever reaches a student linked to them in parent_student; another child is 403 (walking-skeleton.md S6).
class FeeController extends Controller
{
    public function __construct(private FeeService $fees) {}

    /** GET /fees/dues?student_id= (admin, accountant) and GET /parent/fees?student_id= (parent: own child only) */
    public function dues(Request $request)
    {
        $request->validate(['student_id' => 'required|integer']);
        $student = $this->reachableStudent($request, (int) $request->input('student_id'));
        $lines = $this->fees->dueLines($student);

        return response()->json(['success' => true, 'data' => [
            'student' => ['id' => $student->id, 'student_id' => $student->student_id, 'name' => $student->user?->name],
            'lines'   => $lines->values(),
            'batches' => Batch::whereIn('id', $lines->pluck('batch_id')->unique())->pluck('name', 'id'),   // names for the batch column
            'total'   => Money::format($lines->sum(fn ($l) => Money::toPaisa($l['amount']))),
        ]]);
    }

    /** POST /fees/collect: several dues -> one receipt */
    public function collect(CollectFeeRequest $request)
    {
        $data = $request->validated();
        $rows = $this->fees->collect(Student::findOrFail($data['student_id']), $data['lines'], $data['payment_method']);

        return response()->json(['success' => true, 'message' => __('messages.fee_collected'), 'data' => $this->receiptData($rows->first()->receipt_no)], 201);
    }

    /** GET /fees/receipt/{id} - {id} is any line of the receipt; the PDF carries every line of that receipt */
    public function receipt(Request $request, int $id, PdfService $pdf)
    {
        $receipt = $this->receiptData(FeePayment::findOrFail($id)->receipt_no);
        if ($request->query('format') === 'json') return response()->json(['success' => true, 'data' => $receipt]);

        // QR: the institution's primaryUrl() (custom-domain.md) -> the parent's fee page, where this receipt is listed
        $url = app(DomainService::class)->primaryUrl(Tenancy::current()) . '/parent/fees?receipt=' . rawurlencode($receipt['receipt_no']);
        $qr = 'data:image/svg+xml;base64,' . base64_encode((new SvgWriter())->write(new QrCode($url, size: 160, margin: 0))->getString());
        return response($pdf->render('pdf.receipt', ['receipt' => $receipt, 'qr' => $qr, 'qrUrl' => $url], 'a5'), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . $receipt['receipt_no'] . '.pdf"',
        ]);
    }

    /** GET /fees/payments/student/{id} - the student's receipts (admin, accountant; a parent for their own child) */
    public function studentPayments(Request $request, int $id)
    {
        $student = $this->reachableStudent($request, $id);
        $receipts = FeePayment::where('student_id', $student->id)->with('feeCategory:id,name')->orderByDesc('paid_at')->orderBy('line_no')->get()
            ->groupBy('receipt_no')->map(fn ($lines, $no) => [
                'receipt_no' => $no, 'id' => $lines->first()->id, 'paid_at' => $lines->first()->paid_at?->toIso8601String(),
                'payment_method' => $lines->first()->payment_method,
                'total' => Money::format($lines->sum(fn ($l) => Money::toPaisa($l->paid_amount))),
                'lines' => $lines->map(fn ($l) => ['category' => $l->feeCategory?->name, 'period' => $l->month, 'paid_amount' => $l->paid_amount])->values(),
            ])->values();

        return response()->json(['success' => true, 'data' => $receipts]);
    }

    /** GET /fees/categories (admin) */
    public function categories()
    {
        return FeeCategoryResource::collection(FeeCategory::withExists('payments')->orderBy('id')->get())->additional(['success' => true]);
    }

    /** POST /fees/categories (admin) */
    public function storeCategory(FeeCategoryRequest $request)
    {
        return (new FeeCategoryResource($this->fees->saveCategory($request->validated())))->additional(['success' => true])->response()->setStatusCode(201);
    }

    /** PUT /fees/categories/{id} (admin) - no delete route in R1: financial history points at categories (D32) */
    public function updateCategory(int $id)
    {
        $category = FeeCategory::findOrFail($id);          // a foreign id is a 404 before the input is checked
        $data = app(FeeCategoryRequest::class)->validated();
        return (new FeeCategoryResource($this->fees->saveCategory($data, $category)->loadExists('payments')))->additional(['success' => true]);
    }

    /** GET /fees/payments?from=&to=&payment_method=&student_id=&page= (admin, accountant): one row per receipt */
    public function payments(Request $request)
    {
        $f = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d|after_or_equal:from',
            'payment_method' => 'nullable|string|max:30', 'student_id' => 'nullable|integer']);
        $page = $this->fees->receipts($f);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($r) => [
            'id' => (int) $r->id, 'receipt_no' => $r->receipt_no, 'paid_at' => $r->paid_at ? \Illuminate\Support\Carbon::parse($r->paid_at)->toIso8601String() : null,
            'payment_method' => $r->payment_method, 'total' => Money::format(Money::toPaisa((string) $r->total)), 'lines' => (int) $r->line_count,
            'student' => ['id' => $r->student_id, 'student_id' => $r->student?->student_id, 'name' => $r->student?->user?->name],
        ])->values(), 'meta' => ['current_page' => $page->currentPage(), 'last_page' => $page->lastPage(), 'per_page' => $page->perPage(), 'total' => $page->total()]]);
    }

    /** GET /fees/report?month=&program_id=&fee_category_id= (admin) */
    public function report(Request $request)
    {
        $f = $request->validate(['month' => 'nullable|date_format:Y-m', 'program_id' => 'nullable|integer', 'fee_category_id' => 'nullable|integer']);
        return response()->json(['success' => true, 'data' => $this->fees->monthlyReport($f['month'] ?? now()->format('Y-m'),
            isset($f['program_id']) ? (int) $f['program_id'] : null, isset($f['fee_category_id']) ? (int) $f['fee_category_id'] : null)]);
    }

    private function reachableStudent(Request $request, int $id): Student
    {
        $user = $request->user();
        if (!in_array($user->role, ['admin', 'accountant', 'parent'], true)) abort(403);
        $student = Student::with('user:id,name')->findOrFail($id);
        // another family's child in the SAME institution: 403 as the walking-skeleton spec (S6) says; another institution's: 404 (tenant scope)
        if ($user->role === 'parent' && !ParentStudent::where('parent_user_id', $user->id)->where('student_id', $student->id)->exists()) {
            abort(403);
        }
        return $student;
    }

    private function receiptData(string $receiptNo): array
    {
        $lines = FeePayment::where('receipt_no', $receiptNo)->with(['feeCategory:id,name', 'batch:id,name', 'student.user:id,name'])->orderBy('line_no')->get();
        $first = $lines->first();
        return [
            'id' => $first->id, 'receipt_no' => $receiptNo, 'paid_at' => $first->paid_at?->toIso8601String(), 'payment_method' => $first->payment_method,
            'student' => ['id' => $first->student_id, 'student_id' => $first->student?->student_id, 'name' => $first->student?->user?->name],
            'lines' => $lines->map(fn ($l) => [
                'line_no' => $l->line_no, 'category' => $l->feeCategory?->name, 'batch' => $l->batch?->name, 'period' => $l->month,
                'amount' => $l->amount, 'discount' => $l->discount, 'paid_amount' => $l->paid_amount, 'status' => $l->status,
            ])->values(),
            'total' => Money::format($lines->sum(fn ($l) => Money::toPaisa($l->paid_amount))),
        ];
    }
}
