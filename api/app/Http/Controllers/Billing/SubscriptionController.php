<?php

namespace App\Http\Controllers\Billing;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{ModulePrice, PlatformSetting, SubscriptionInvoice, SubscriptionInvoiceLine};
use App\Services\Billing\{BkashService, ModuleEntitlementService, SubscriptionBillingService};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

// D187 SUB.2: the institution admin's module subscriptions - status, quote, bKash checkout (the D58 flow), coupon, remove from
// the next period (no refund) and invoices. Amounts are always computed by the server; the client sends modules and cycles only.
class SubscriptionController extends Controller
{
    public function __construct(private ModuleEntitlementService $entitlements, private SubscriptionBillingService $billing) {}

    public function show()
    {
        $i = Tenancy::current();
        $prices = ModulePrice::current();
        $modules = [];
        foreach ($this->entitlements->all($i) as $key => $s) {
            $modules[] = ['module_key' => $key, 'state' => $this->entitlements->state($i, $key), 'billing_cycle' => $s->billing_cycle,
                'trial_ends_at' => $s->trial_ends_at?->toIso8601String(), 'current_period_end' => $s->current_period_end?->toIso8601String(),
                'cancel_at_period_end' => (bool) $s->cancel_at_period_end, 'requires' => config("subscriptions.requires.{$key}", []),
                'monthly_price' => isset($prices[$key]) ? $prices[$key]->monthly_price : '0.00', 'yearly_price' => isset($prices[$key]) ? $prices[$key]->yearly_price : '0.00'];
        }
        $c = $this->billing->runningCoupon();
        return response()->json(['success' => true, 'data' => ['modules' => $modules, 'grace_days' => (int) config('subscriptions.grace_days'),
            'coupon' => $c ? ['code' => $c->coupon->code, 'percent' => $c->coupon->value, 'modules' => $c->coupon->applies_to_modules,
                'until' => $c->created_at->copy()->addMonthsNoOverflow((int) $c->coupon->discount_months)->toIso8601String()] : null]]);
    }

    private function items(Request $request): array
    {
        return $request->validate(['items' => 'required|array|min:1|max:60', 'items.*.module_key' => 'required|string|max:50',
            'items.*.billing_cycle' => 'required|in:monthly,yearly', 'amount' => 'prohibited', 'total' => 'prohibited'])['items'];
    }

    public function quote(Request $request)
    {
        return response()->json(['success' => true, 'data' => $this->billing->quote(Tenancy::current(), $this->items($request))]);
    }

    public function checkout(Request $request, BkashService $bkash)
    {
        $i = Tenancy::current();
        $quote = $this->billing->quote($i, $this->items($request));
        $ref = 'SUB' . $i->id . 'P' . strtoupper(Str::random(8));                               // <= 20 chars, [A-Z0-9]
        if ($quote['total'] === '0.00') {
            // a coupon that covers the whole bill: recorded at once, no money moved; no price and no coupon -> nothing to pay
            if (!$quote['coupon_id']) throw new BusinessException('nothing to pay', 'nothing_to_pay', 422);
            $invoice = $this->billing->complete($i, $ref, $quote, 'coupon', null, $request->user()->id);
            return response()->json(['success' => true, 'data' => ['paid' => true, 'invoice_number' => $invoice->invoice_number, 'total' => $quote['total']]]);
        }
        if (!$bkash->configured()) throw new BusinessException('bKash is not configured', 'payment_unavailable', 503);
        $base = PlatformSetting::read('bkash_callback_base') ?: config('app.url');
        $payment = $bkash->createPayment($quote['total'], $ref, rtrim((string) $base, '/') . '/api/v1/billing/subscription/bkash/callback?ref=' . $ref);
        if (!$payment) return response()->json(['success' => false, 'error' => 'payment_failed', 'message' => __('errors.recharge_failed')
            . (config('app.debug') && $bkash->lastError() ? ' (' . $bkash->lastError() . ')' : '')], 502);
        $back = $request->headers->get('origin');
        Cache::put("sub_checkout:{$ref}", ['institution_id' => $i->id, 'quote' => $quote, 'payment_id' => $payment['paymentID'], 'by' => $request->user()->id,
            'return' => ($back && parse_url($back, PHP_URL_HOST) === $request->getHost()) ? $back : $request->getSchemeAndHttpHost()], now()->addDay());
        return response()->json(['success' => true, 'data' => ['paid' => false, 'bkash_url' => $payment['bkashURL'], 'ref' => $ref, 'total' => $quote['total']]]);
    }

    public function redeem(Request $request)
    {
        $f = $request->validate(['code' => 'required|string|max:30']);
        $r = $this->billing->redeem(Tenancy::current(), $f['code']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['code' => $r->coupon->code, 'percent' => $r->coupon->value,
            'modules' => $r->coupon->applies_to_modules, 'until' => $r->created_at->copy()->addMonthsNoOverflow((int) $r->coupon->discount_months)->toIso8601String()]]);
    }

    /** D187 (2): removing a module takes effect from the next period, no refund; resuming before then keeps it */
    public function cancel(Request $request) { return $this->setCancel($request->validate(['module_key' => 'required|string|max:50'])['module_key'], true); }
    public function resume(Request $request) { return $this->setCancel($request->validate(['module_key' => 'required|string|max:50'])['module_key'], false); }

    private function setCancel(string $module, bool $cancel)
    {
        $subs = $this->entitlements->all(Tenancy::current());
        if (!isset($subs[$module])) throw new BusinessException('this module is not sold to this institution', 'module_not_billable', 422);
        $subs[$module]->update(['cancel_at_period_end' => $cancel]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['module_key' => $module, 'cancel_at_period_end' => $cancel]]);
    }

    public function invoices()
    {
        $rows = SubscriptionInvoice::orderByDesc('id')->limit(100)->get();
        $lines = SubscriptionInvoiceLine::whereIn('subscription_invoice_id', $rows->pluck('id'))->orderBy('id')->get()->groupBy('subscription_invoice_id');
        return response()->json(['success' => true, 'data' => $rows->map(fn ($v) => ['id' => $v->id, 'invoice_number' => $v->invoice_number, 'billing_period' => $v->billing_period,
            'amount' => $v->amount, 'discount' => $v->discount, 'tax' => $v->tax, 'total' => $v->total, 'issued_at' => $v->issued_at?->toIso8601String(),
            'lines' => ($lines[$v->id] ?? collect())->map(fn ($l) => $l->only(['module_key', 'billing_cycle', 'days', 'unit_price', 'amount', 'discount'])
                + ['period_start' => $l->period_start->toDateString(), 'period_end' => $l->period_end->toDateString()])->values()])->values()]);
    }
}
