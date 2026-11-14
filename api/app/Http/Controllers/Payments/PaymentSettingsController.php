<?php

namespace App\Http\Controllers\Payments;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, InstitutionPaymentGateway, OnlinePayment};
use App\Services\Payments\{GatewayRegistry, PaymentRouter};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

// D217 OPAY.3 (docs/modules/online-fee-payment.md "API Endpoints", institution admin): the institution's online payments (the
// accountant reads them too) and the payment settings - which gateways the registry offers here and whether each is switched on.
// The form is built from the registry's credential_fields; credentials are saved encrypted and never returned (only a hint).
// Today the registry holds only the test gateway (no fields) and nothing in production.
class PaymentSettingsController extends Controller
{
    public function __construct(private PaymentRouter $router) {}

    /** GET /admin/payments?status=&gateway=&student_id=&from=&to= */
    public function index(Request $request)
    {
        $f = $request->validate(['status' => 'nullable|in:initiated,success,failed,cancelled,refunded,review', 'gateway' => 'nullable|string|max:30', 'student_id' => 'nullable|integer',
            'from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d', 'page' => 'nullable|integer|min:1']);
        $page = OnlinePayment::with('student.user:id,name')
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))->when($f['gateway'] ?? null, fn ($q, $v) => $q->where('gateway', $v))
            ->when($f['student_id'] ?? null, fn ($q, $v) => $q->where('student_id', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('initiated_at', '>=', $v))->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('initiated_at', '<=', $v))
            ->orderByDesc('id')->paginate(30);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($p) => self::row($p))->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }

    /** GET /admin/payments/{id} */
    public function show(int $id)
    {
        $p = OnlinePayment::with('student.user:id,name')->findOrFail($id);
        return response()->json(['success' => true, 'data' => self::row($p) + ['items' => array_map(fn ($i) => ['category' => $i['category'] ?? null, 'month' => $i['month'], 'amount' => $i['amount']], $p->items ?? [])]]);
    }

    /** GET /admin/settings/payments */
    public function settings()
    {
        return response()->json(['success' => true, 'data' => $this->settingsData()]);
    }

    /** PUT /admin/settings/payments/gateways/{gateway} {credentials: {...as credential_fields...}, is_sandbox, password} - saved as pending */
    public function saveGateway(Request $request, string $gateway)
    {
        $def = $this->definition($gateway);
        $rules = ['password' => 'required|string', 'is_sandbox' => 'sometimes|boolean', 'credentials' => 'sometimes|array'];
        foreach ($def['credential_fields'] ?? [] as $field) $rules['credentials.' . $field['key']] = 'required|string|max:255';
        $d = $request->validate($rules);
        if (!Hash::check($d['password'], $request->user()->password)) throw new BusinessException('password', 'payment_password_wrong', 422);
        $keys = array_column($def['credential_fields'] ?? [], 'key');
        $creds = array_intersect_key($d['credentials'] ?? [], array_flip($keys));
        $main = $keys ? (string) ($creds[$keys[0]] ?? '') : '';
        $row = InstitutionPaymentGateway::firstOrNew(['gateway' => $gateway]);
        $row->fill(['credentials' => $creds, 'credentials_hint' => $main !== '' ? '…' . mb_substr($main, -4) : null, 'is_sandbox' => (bool) ($d['is_sandbox'] ?? false),
            'status' => 'pending', 'last_error' => null, 'created_by' => $row->created_by ?? $request->user()->id])->save();
        AuditLog::record('payment_gateway.saved', $row, ['gateway' => $gateway]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->settingsData()]);
    }

    /** POST /admin/settings/payments/gateways/{gateway}/test - verifyCredentials(): ok => active, else failed + last_error */
    public function testGateway(string $gateway)
    {
        $this->definition($gateway);
        $row = InstitutionPaymentGateway::where('gateway', $gateway)->firstOrFail();
        $res = GatewayRegistry::make($gateway)->verifyCredentials($row->credentials ?? [], (bool) $row->is_sandbox);
        $row->update(['status' => $res['ok'] ? 'active' : 'failed', 'last_error' => $res['ok'] ? null : mb_substr((string) ($res['error'] ?? 'failed'), 0, 250), 'last_checked_at' => now()]);
        AuditLog::record('payment_gateway.tested', $row, ['gateway' => $gateway, 'ok' => (bool) $res['ok']]);
        return response()->json(['success' => true, 'data' => $this->settingsData()]);
    }

    /** DELETE /admin/settings/payments/gateways/{gateway} - switch off (the row and past payments stay) */
    public function disableGateway(string $gateway)
    {
        $row = InstitutionPaymentGateway::where('gateway', $gateway)->firstOrFail();
        $row->update(['status' => 'disabled']);
        AuditLog::record('payment_gateway.disabled', $row, ['gateway' => $gateway]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->settingsData()]);
    }

    private function definition(string $gateway): array
    {
        if (!in_array($gateway, GatewayRegistry::enabledKeys(), true)) abort(404);
        return GatewayRegistry::definition($gateway);
    }

    private function settingsData(): array
    {
        $rows = InstitutionPaymentGateway::get()->keyBy('gateway');
        $offered = collect($this->router->options(Tenancy::current()))->pluck('mode', 'gateway');
        return [
            'available_gateways' => collect(GatewayRegistry::enabledKeys())->map(function ($k) {
                $d = GatewayRegistry::definition($k);
                return ['key' => $k, 'label' => $d['label'], 'flow' => $d['flow'], 'sandbox_toggle' => (bool) ($d['sandbox_toggle'] ?? false),
                    'credential_fields' => array_map(fn ($f) => ['key' => $f['key'], 'label' => $f['label'], 'secret' => (bool) ($f['secret'] ?? false)], $d['credential_fields'] ?? [])];
            })->values()->all(),
            'gateways' => $rows->map(fn ($r) => ['gateway' => $r->gateway, 'status' => $r->status, 'credentials_hint' => $r->credentials_hint, 'is_sandbox' => (bool) $r->is_sandbox,
                'last_error' => $r->last_error, 'last_checked_at' => $r->last_checked_at?->toIso8601String()])->values()->all(),
            'effective_mode' => collect(GatewayRegistry::enabledKeys())->mapWithKeys(fn ($k) => [$k => $offered[$k] ?? null])->all(),
            'real_gateways' => false,   // D217: no real provider is connected yet - nothing here can move real money
        ];
    }

    public static function row(OnlinePayment $p): array
    {
        return ['id' => $p->id, 'ref' => $p->gateway_ref, 'gateway' => $p->gateway, 'channel' => $p->channel, 'flow' => $p->flow, 'collected_by' => $p->collected_by, 'amount' => $p->amount,
            'status' => $p->status, 'failure_reason' => $p->failure_reason, 'trx_id' => $p->trx_id, 'receipt_no' => $p->receipt_no,
            'initiated_at' => $p->initiated_at?->toIso8601String(), 'paid_at' => $p->paid_at?->toIso8601String(),
            'student' => $p->student ? ['id' => $p->student->id, 'name' => $p->student->user?->name, 'student_id' => $p->student->student_id] : null];
    }
}
