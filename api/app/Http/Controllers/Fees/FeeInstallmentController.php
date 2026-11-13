<?php

namespace App\Http\Controllers\Fees;

use App\Http\Controllers\Controller;
use App\Models\{FeeInstallment, FeeInstallmentPlan, Student};
use App\Services\Fees\InstallmentService;
use Illuminate\Http\Request;

// D211 (docs/modules/extended-features.md section 2 "API"): fee installments for the admin and the accountant -
// INST.1: the plans (list, make, detail) and changing an unpaid installment's due date.
class FeeInstallmentController extends Controller
{
    public function __construct(private InstallmentService $installments) {}

    /** GET /fees/installments?student_id= - plans, newest first */
    public function index(Request $request)
    {
        $f = $request->validate(['student_id' => 'nullable|integer', 'page' => 'nullable|integer|min:1']);
        $page = FeeInstallmentPlan::with(['items', 'category:id,name', 'student:id,user_id,student_id', 'student.user:id,name'])
            ->when($f['student_id'] ?? null, fn ($q, $s) => $q->where('student_id', $s))->orderByDesc('id')->paginate(30);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($p) => $this->plan($p))->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    /** POST /fees/installments/plan { student_id, due_key, installments, first_due_date } */
    public function store(Request $request)
    {
        $d = $request->validate(['student_id' => 'required|integer', 'due_key' => ['required', 'string', 'max:100', 'regex:/^\d+:\d+:[\w-]+$/'],
            'installments' => 'required|integer|min:2|max:24', 'first_due_date' => 'required|date_format:Y-m-d|after_or_equal:today']);
        $student = Student::findOrFail($d['student_id']);
        $plan = $this->installments->createPlan($student, $d['due_key'], (int) $d['installments'], $d['first_due_date'], $request->user()->id);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->plan($plan->load(['items', 'category:id,name', 'student:id,user_id,student_id', 'student.user:id,name']))], 201);
    }

    /** GET /fees/installments/{id} - a plan (the spec's {planId}) */
    public function show(int $id)
    {
        $plan = FeeInstallmentPlan::with(['items', 'category:id,name', 'student:id,user_id,student_id', 'student.user:id,name'])->findOrFail($id);
        return response()->json(['success' => true, 'data' => $this->plan($plan)]);
    }

    /** PUT /fees/installments/{id} { due_date } - an unpaid installment only */
    public function update(Request $request, int $id)
    {
        $item = FeeInstallment::findOrFail($id);
        $d = $request->validate(['due_date' => 'required|date_format:Y-m-d']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->item($this->installments->changeDueDate($item, $d['due_date']))]);
    }

    protected function plan(FeeInstallmentPlan $p): array
    {
        return ['id' => $p->id, 'due_key' => $p->due_key, 'total_amount' => $p->total_amount, 'installments' => $p->installments,
            'category' => $p->category?->name, 'student' => $p->student ? ['id' => $p->student->id, 'name' => $p->student->user?->name, 'student_id' => $p->student->student_id] : null,
            'created_at' => $p->created_at?->toIso8601String(), 'items' => $p->items->map(fn ($i) => $this->item($i))->values()];
    }

    protected function item(FeeInstallment $i): array
    {
        return ['id' => $i->id, 'plan_id' => $i->plan_id, 'installment_no' => $i->installment_no, 'amount' => $i->amount, 'due_date' => $i->due_date?->toDateString(),
            'status' => $i->status, 'paid_at' => $i->paid_at?->toIso8601String(), 'payment_id' => $i->payment_id];
    }
}
