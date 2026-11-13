<?php

namespace App\Http\Controllers\Admission;

use App\Http\Controllers\Controller;
use App\Models\{AdmissionCycle, AdmissionLead, AuditLog, LeadPayment};
use App\Services\Admission\AdmissionFeeService;
use App\Support\Money;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// D209 ACY.2: the application fee - the institution's methods (admin), a cycle's applications with paid / unpaid (admin,
// accountant), cash at the office with an APP- receipt (admin, accountant) and a reversal (admin; a new negative row, D32).
class LeadPaymentController extends Controller
{
    public function __construct(private AdmissionFeeService $fees) {}

    /** GET /admission/fee-methods */
    public function methods()
    {
        return response()->json(['success' => true, 'data' => ['methods' => $this->fees->methods(app('currentInstitution')), 'online_available' => false]]);
    }

    /** PUT /admission/fee-methods {methods: ['cash', 'online']} */
    public function updateMethods(Request $request)
    {
        $d = $request->validate(['methods' => 'required|array|min:1|max:2', 'methods.*' => ['required', 'distinct', Rule::in(LeadPayment::METHODS)]]);
        $i = app('currentInstitution');
        $settings = $i->settings ?? [];
        $settings['admission_fee_methods'] = array_values(array_intersect(LeadPayment::METHODS, $d['methods']));
        DB::transaction(function () use ($i, $settings) {
            $i->forceFill(['settings' => $settings])->save();
            AuditLog::record('admission_fee_methods.updated', $i, ['methods' => $settings['admission_fee_methods']]);
        });
        return $this->methods();
    }

    /** GET /admission/fee-cycles - the cycles, newest first, for the accountant to find one (read only) */
    public function cycles()
    {
        $rows = AdmissionCycle::with('program:id,name')->withCount('leads')->orderByDesc('id')->get()->map(fn ($c) => ['id' => $c->id, 'name' => $c->name,
            'program' => $c->program ? ['id' => $c->program->id, 'name' => $c->program->name] : null, 'seats' => $c->seats, 'apply_from' => $c->apply_from?->toDateString(),
            'apply_until' => $c->apply_until?->toDateString(), 'test_date' => $c->test_date?->toDateString(), 'application_fee' => $c->application_fee, 'status' => $c->status,
            'rule' => $c->rule, 'applications' => $c->leads_count, 'accepting' => $c->accepting()]);
        return response()->json(['success' => true, 'data' => $rows->values()]);
    }

    /** GET /admission/cycles/{id}/applications - every application of the cycle, oldest first, with what is paid */
    public function applications(int $id)
    {
        $c = AdmissionCycle::findOrFail($id);
        $paid = LeadPayment::whereIn('lead_id', AdmissionLead::where('cycle_id', $c->id)->select('id'))->get(['lead_id', 'amount'])
            ->groupBy('lead_id')->map(fn ($rows) => $rows->sum(fn ($r) => Money::toPaisa((string) $r->amount)));
        $fee = Money::toPaisa((string) $c->application_fee);
        $rows = AdmissionLead::where('cycle_id', $c->id)->orderBy('id')->get()->map(fn ($l) => [
            'id' => $l->id, 'name' => $l->name, 'phone' => $l->phone, 'application_no' => $l->application_no, 'applied_at' => $l->created_at?->toIso8601String(),
            'paid_amount' => Money::format($paid[$l->id] ?? 0), 'paid' => $fee === 0 || ($paid[$l->id] ?? 0) >= $fee,
            'test_roll' => $l->test_roll, 'test_marks' => $l->test_marks, 'merit_rank' => $l->merit_rank, 'list_status' => $l->list_status,
        ]);
        return response()->json(['success' => true, 'data' => $rows->values(), 'meta' => ['application_fee' => $c->application_fee, 'status' => $c->status,
            'methods' => $this->fees->methods(app('currentInstitution'))]]);
    }

    /** GET /admission/leads/{id}/payments */
    public function index(int $id)
    {
        $lead = AdmissionLead::findOrFail($id);
        return response()->json(['success' => true, 'data' => LeadPayment::where('lead_id', $lead->id)->orderBy('id')->get()->map(fn ($p) => $this->row($p))->values()]);
    }

    /** POST /admission/leads/{id}/payments - cash at the office; the amount is the cycle's fee */
    public function store(Request $request, int $id)
    {
        $p = $this->fees->collectCash(AdmissionLead::findOrFail($id), $request->user()->id);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($p)], 201);
    }

    /** POST /admission/lead-payments/{id}/reverse {reason} */
    public function reverse(Request $request, int $id)
    {
        $p = LeadPayment::findOrFail($id);   // another institution's id is a 404 before any validation
        $d = $request->validate(['reason' => 'required|string|max:200']);
        $r = $this->fees->reverse($p, $request->user()->id, $d['reason']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($r)], 201);
    }

    private function row(LeadPayment $p): array
    {
        return ['id' => $p->id, 'lead_id' => $p->lead_id, 'method' => $p->method, 'amount' => $p->amount, 'receipt_no' => $p->receipt_no, 'paid_at' => $p->paid_at?->toIso8601String()];
    }
}
