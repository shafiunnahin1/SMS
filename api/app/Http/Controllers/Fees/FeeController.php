<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Http\Requests\Fees\CollectFeeRequest;
use App\Models\{Batch, FeePayment, ParentStudent, Student};
use App\Services\{FeeService, PdfService};
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

        return response($pdf->render('pdf.receipt', ['receipt' => $receipt], 'a5'), 200, [
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

    private function reachableStudent(Request $request, int $id): Student
    {
        $user = $request->user();
        if (!in_array($user->role, ['admin', 'accountant', 'parent'], true)) abort(403);
        $student = Student::with('user:id,name')->findOrFail($id);
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
