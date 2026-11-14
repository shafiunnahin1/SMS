<?php

namespace App\Http\Controllers\Payments;

use App\Http\Controllers\Controller;
use App\Models\{Institution, OnlinePayment};
use App\Services\Payments\{GatewayRegistry, OnlinePaymentService};
use App\Support\Tenancy;
use Illuminate\Http\Request;

// D217 OPAY.3 (docs/modules/online-fee-payment.md, Super Admin, central host): every institution's online payments, above all
// those in `review` - money a gateway took that was NOT credited (wrong amount, late, duplicate). A person decides: accept as paid
// (only a late payment of the right amount whose dues are still unpaid) or mark refunded; "verify" asks the provider again.
class SuperOnlinePaymentController extends Controller
{
    public function __construct(private OnlinePaymentService $payments) {}

    /** GET /super/online-payments?status=&institution_id= */
    public function index(Request $request)
    {
        $f = $request->validate(['status' => 'nullable|in:initiated,success,failed,cancelled,refunded,review', 'institution_id' => 'nullable|integer']);
        $rows = OnlinePayment::anyInstitution()->with('institution:id,name')
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))->when($f['institution_id'] ?? null, fn ($q, $v) => $q->where('institution_id', $v))
            ->orderByDesc('id')->limit(500)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($p) => $this->row($p))->values()]);
    }

    /** POST /super/online-payments/{id}/resolve {action: accept_as_paid|mark_refunded, note?} */
    public function resolve(Request $request, int $id)
    {
        $d = $request->validate(['action' => 'required|in:accept_as_paid,mark_refunded', 'note' => 'nullable|string|max:250']);
        $p = OnlinePayment::anyInstitution()->findOrFail($id);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($this->payments->resolveReview($p, $d['action'], $d['note'] ?? null))]);
    }

    /** POST /super/online-payments/{id}/verify - ask the provider again */
    public function verify(int $id)
    {
        $p = OnlinePayment::anyInstitution()->findOrFail($id);
        if (GatewayRegistry::definition($p->gateway) && (GatewayRegistry::make($p->gateway)->capabilities()['query'] ?? false)) $this->payments->finalize($p->gateway_ref, [], true);
        return response()->json(['success' => true, 'data' => $this->row(OnlinePayment::anyInstitution()->findOrFail($id))]);
    }

    private function row(OnlinePayment $p): array
    {
        return ['id' => $p->id, 'institution' => ['id' => $p->institution_id, 'name' => $p->relationLoaded('institution') ? $p->institution?->name : Institution::whereKey($p->institution_id)->value('name')],
            'ref' => $p->gateway_ref, 'gateway' => $p->gateway, 'channel' => $p->channel, 'collected_by' => $p->collected_by, 'amount' => $p->amount, 'status' => $p->status,
            'failure_reason' => $p->failure_reason, 'trx_id' => $p->trx_id, 'receipt_no' => $p->receipt_no, 'initiated_at' => $p->initiated_at?->toIso8601String(), 'paid_at' => $p->paid_at?->toIso8601String()];
    }
}
