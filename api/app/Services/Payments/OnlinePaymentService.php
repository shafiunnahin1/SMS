<?php

namespace App\Services\Payments;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Institution, InstitutionPaymentGateway, OnlinePayment, Student, User};
use App\Services\FeeService;
use App\Support\{Money, Tenancy};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// D217 OPAY.1 (docs/modules/online-fee-payment.md "OnlinePaymentService"). The amount is ALWAYS computed here from the dues - the
// client only names which dues. finalize() is the one function behind the notification, the status poll and the reconcile job; it
// is safe to call any number of times. Once a provider says money was taken the row is never marked failed: it becomes success
// (fees credited, one receipt) or review (nothing credited; a person decides).
class OnlinePaymentService
{
    public function __construct(private PaymentRouter $router, private FeeService $fees) {}

    /** $dueKeys = ["{enrollment_id}:{fee_category_id}:{period}", ...] of this parent's own child */
    public function initiate(User $parent, Student $student, array $dueKeys, string $gateway): array
    {
        $institution = Tenancy::current();
        if (!$student->parents()->whereKey($parent->id)->exists()) abort(404);
        $route = $this->router->resolve($institution, $gateway) ?? throw new BusinessException('gateway not available', 'payment_gateway_unavailable', 422);

        $items = $this->fees->outstandingItems($student, $dueKeys);
        $amount = array_sum(array_map(fn ($i) => Money::toPaisa($i['amount']), $items));
        if ($amount < Money::toPaisa(config('payments.min_amount'))) throw new BusinessException('below the minimum', 'payment_below_minimum', 422, ['min' => config('payments.min_amount')]);

        return DB::transaction(function () use ($parent, $student, $items, $amount, $gateway, $route) {
            Student::whereKey($student->id)->lockForUpdate()->first();   // one attempt at a time per student
            if ($this->hasLiveAttempt($student, $items)) throw new BusinessException('a payment for this due is in progress', 'payment_in_progress', 422);

            $p = OnlinePayment::create(['student_id' => $student->id, 'parent_user_id' => $parent->id, 'gateway' => $gateway, 'flow' => $route['flow'], 'collected_by' => $route['mode'],
                'amount' => Money::format($amount), 'gateway_fee' => '0.00', 'platform_fee' => '0.00', 'net_amount' => Money::format($amount), 'status' => 'initiated',
                'items' => $items, 'gateway_ref' => $this->newRef(), 'initiated_at' => now()]);
            $res = GatewayRegistry::make($gateway)->create($p, $route['credentials'], $route['sandbox']);
            $p->update(['gateway_payment_id' => $res['gateway_payment_id'] ?? null, 'qr_payload' => $res['qr_payload'] ?? null,
                'expires_at' => isset($res['expires_at']) ? \Carbon\Carbon::parse($res['expires_at']) : null]);
            $this->audit('online_payment.initiated', $p, ['student_id' => $student->id, 'gateway' => $gateway]);

            return array_filter(['flow' => $res['flow'], 'ref' => $p->gateway_ref, 'mode' => $route['mode'], 'payment_url' => $res['payment_url'] ?? null,
                'qr_payload' => $res['qr_payload'] ?? null, 'expires_at' => $p->expires_at?->toIso8601String()], fn ($v) => $v !== null);
        });
    }

    /** these run on the central host or in a worker with nobody signed in: the row is attributed to the paying parent (or the acting Super Admin) */
    private function audit(string $action, OnlinePayment $p, array $data = [], ?int $by = null): void
    {
        AuditLog::create(['institution_id' => $p->institution_id, 'user_id' => $by ?? $p->parent_user_id, 'action' => $action, 'model' => 'OnlinePayment', 'model_id' => $p->id,
            'new_data' => $data ?: null, 'ip_address' => request()->ip()]);
    }

    /** an open, unexpired attempt on any of the same dues */
    private function hasLiveAttempt(Student $student, array $items): bool
    {
        $keys = array_column($items, 'key');
        $ttl = (int) config('payments.initiated_ttl_minutes');
        return OnlinePayment::where('student_id', $student->id)->where('status', 'initiated')->get()->contains(function (OnlinePayment $p) use ($keys, $ttl) {
            $until = $p->expires_at ?? $p->initiated_at?->copy()->addMinutes($ttl);
            return $until && $until->isFuture() && array_intersect($keys, array_column($p->items ?? [], 'key'));
        });
    }

    /** 20 chars, [A-Z0-9], unguessable; the same value goes to every provider */
    private function newRef(): string
    {
        do {
            $ref = 'F' . preg_replace('/[^A-Z0-9]/', 'X', strtoupper(Str::random(19)));
        } while (Tenancy::withoutTenancy(fn () => OnlinePayment::where('gateway_ref', $ref)->exists()));   // the ref is unique across institutions
        return $ref;
    }

    /** the institution a ref belongs to (the central host and the worker have no tenant) */
    public function institutionOf(string $ref): ?Institution
    {
        $id = Tenancy::withoutTenancy(fn () => OnlinePayment::where('gateway_ref', $ref)->value('institution_id'));   // lookup by ref
        return $id ? Institution::find($id) : null;
    }

    /** the credentials of the mode used when the payment began */
    public function credentials(OnlinePayment $p): array
    {
        return InstitutionPaymentGateway::where('gateway', $p->gateway)->first()?->credentials ?? [];
    }

    public function finalize(string $ref, array $callback = [], bool $fromQuery = false): OnlinePayment
    {
        $institution = $this->institutionOf($ref) ?? abort(404);
        return Tenancy::as($institution, fn () => DB::transaction(function () use ($ref, $callback, $fromQuery) {
            $p = OnlinePayment::where('gateway_ref', $ref)->lockForUpdate()->firstOrFail();
            if (in_array($p->status, ['success', 'refunded', 'review'], true)) return $p;   // already decided

            $row = InstitutionPaymentGateway::where('gateway', $p->gateway)->first();
            $creds = $row?->credentials ?? [];
            $gw = GatewayRegistry::make($p->gateway);
            $res = $fromQuery ? $gw->query($p, $creds, (bool) $row?->is_sandbox) : $gw->confirm($p, $callback, $creds, (bool) $row?->is_sandbox);
            if (($res['reason'] ?? null) === 'pending') return $p;

            $closed = in_array($p->status, ['failed', 'cancelled'], true);
            if (!($res['ok'] ?? false)) {
                if (!$closed) $p->update(['status' => 'failed', 'failure_reason' => Str::limit((string) ($res['reason'] ?? 'failed'), 250), 'raw_response' => $res['raw'] ?? null]);
                return $p;
            }

            // the provider says money was taken: from here on never 'failed'
            $amountOk = Money::toPaisa((string) ($res['amount'] ?? '0')) === Money::toPaisa($p->amount);
            $reason = !$amountOk ? 'amount_mismatch' : ($closed ? 'late_payment' : null);
            if (!$reason && !$this->fees->stillOutstanding($p)) $reason = 'duplicate';   // the dues were paid another way meanwhile
            $p->fill(['trx_id' => $res['trx_id'] ?? null, 'channel' => $res['channel'] ?? $p->channel, 'raw_response' => $res['raw'] ?? null]);
            if ($reason) {
                $p->fill(['status' => 'review', 'failure_reason' => $reason])->save();
                $this->audit('online_payment.needs_review', $p, ['reason' => $reason]);
                return $p;
            }
            $p->save();
            $this->fees->recordOnlinePayment($p);
            $this->audit('online_payment.success', $p, ['receipt_no' => $p->receipt_no]);
            return $p;
        }));
    }

    /** Super Admin: accept_as_paid (a late payment of the right amount whose dues are still unpaid) or mark_refunded */
    public function resolveReview(OnlinePayment $p, string $action, ?string $note = null): OnlinePayment
    {
        return Tenancy::as(Institution::findOrFail($p->institution_id), fn () => DB::transaction(function () use ($p, $action, $note) {
            $p = OnlinePayment::whereKey($p->id)->lockForUpdate()->firstOrFail();
            if ($p->status !== 'review') throw new BusinessException('not in review', 'payment_not_in_review', 422);
            if ($action === 'accept_as_paid') {
                if ($p->failure_reason !== 'late_payment' || !$this->fees->stillOutstanding($p)) throw new BusinessException('cannot be accepted', 'payment_cannot_accept', 422);
                $this->fees->recordOnlinePayment($p);
            } else {
                $p->update(['status' => 'refunded', 'failure_reason' => Str::limit((string) ($note ?: $p->failure_reason), 250)]);
            }
            $this->audit("online_payment.review_{$action}", $p, [], auth()->id());
            return $p->refresh();
        }));
    }

    /** the reconcile job: ask again where the provider can be asked, and close attempts whose time is over. @return int[] [finalized, cancelled] */
    public function reconcile(): array
    {
        $done = 0; $cancelled = 0;
        $rows = Tenancy::withoutTenancy(fn () => OnlinePayment::where('status', 'initiated')->orderBy('id')->limit(500)->get(['id', 'gateway_ref', 'gateway', 'flow', 'institution_id', 'expires_at', 'initiated_at']));   // every institution's open attempts
        foreach ($rows as $r) {
            if (!GatewayRegistry::definition($r->gateway)) continue;
            $canQuery = GatewayRegistry::make($r->gateway)->capabilities()['query'] ?? false;
            $age = $r->initiated_at?->diffInMinutes(now()) ?? 0;
            if ($canQuery && ($r->flow === 'qr' || $age >= (int) config('payments.reconcile_after_minutes'))) {
                if ($this->finalize($r->gateway_ref, [], true)->status !== 'initiated') { $done++; continue; }
            }
            $over = $r->flow === 'qr'
                ? ($r->expires_at && $r->expires_at->copy()->addMinutes((int) config('payments.qr_late_grace_minutes'))->isPast())
                : ($r->initiated_at && $r->initiated_at->copy()->addHours((int) config('payments.expire_after_hours'))->isPast());
            if ($over) {
                $institution = Institution::find($r->institution_id);
                if ($institution) Tenancy::as($institution, fn () => OnlinePayment::whereKey($r->id)->where('status', 'initiated')->update(['status' => 'cancelled', 'failure_reason' => 'expired']));
                $cancelled++;
            }
        }
        return [$done, $cancelled];
    }
}
