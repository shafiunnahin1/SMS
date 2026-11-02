<?php

namespace App\Services\Billing;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Coupon, CouponRedemption, Institution, InstitutionModuleSubscription, ModulePrice, Payment, SubscriptionInvoice, SubscriptionInvoiceLine};
use App\Support\{Money, Tenancy};
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

// D187 SUB.2: the server prices every bill (G9: integer paisa, half up; the client never sends an amount).
// A module's paid period starts when what it already has ends (a running paid period or its trial), else now. A module added while
// other modules of the same cycle run is charged only up to their end, prorated by days ("charges the prorated rest of the period
// now"); otherwise a whole month / year. A running coupon takes its percent off the covered modules' lines. Tax stays 0 (OD-4).
class SubscriptionBillingService
{
    public function __construct(private ModuleEntitlementService $entitlements) {}

    /** [lines, subtotal, discount, total, coupon_id] for [{module_key, billing_cycle}] */
    public function quote(Institution $institution, array $items, ?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now();
        $prices = ModulePrice::current();
        $subs = $this->entitlements->all($institution);
        $keys = array_column($items, 'module_key');
        if (count($keys) !== count(array_unique($keys))) throw new BusinessException('a module is listed twice', 'validation_error', 422);
        $running = Tenancy::as($institution, fn () => $this->runningCoupon());

        $lines = [];
        foreach ($items as $it) {
            $key = $it['module_key']; $cycle = $it['billing_cycle'];
            if (!isset($subs[$key])) throw new BusinessException('this module is not sold to this institution', 'module_not_billable', 422);
            foreach (config("subscriptions.requires.{$key}", []) as $need) {
                if (in_array($need, $keys, true) || !isset($subs[$need])) continue;                      // bought together, or free
                $end = $subs[$need]->current_period_end;
                if ($subs[$need]->status === 'cancelled' || $end === null || $end->lessThanOrEqualTo($now)) {
                    throw new BusinessException("{$key} needs {$need}", 'module_requires', 422, ['module' => $key, 'requires' => $need]);
                }
            }
            $s = $subs[$key];
            $start = $now;
            if ($s->current_period_end && $s->current_period_end->greaterThan($start) && $s->status !== 'cancelled') $start = CarbonImmutable::parse($s->current_period_end);
            elseif (!$s->current_period_end && $s->trial_ends_at && $s->trial_ends_at->greaterThan($start)) $start = CarbonImmutable::parse($s->trial_ends_at);
            $price = Money::toPaisa((string) ($cycle === 'yearly' ? ($prices[$key]->yearly_price ?? '0') : ($prices[$key]->monthly_price ?? '0')));

            $anchor = $this->anchor($subs, $key, $cycle, $start);
            if ($anchor) {
                $end = $anchor;
                $cycleDays = self::days($anchor->sub(...self::step($cycle)), $anchor);
                $days = self::days($start, $end);
                $amount = Money::ratio($price, $days, $cycleDays);
            } else {
                $end = $start->add(...self::step($cycle));
                $days = self::days($start, $end);
                $amount = $price;
            }
            $discount = 0;
            if ($running && $running->coupon->covers($key) && $running->coupon->type === 'percent') {
                $discount = min($amount, Money::ratio($amount, Money::toPaisa((string) $running->coupon->value), 10000));
            }
            $lines[] = ['module_key' => $key, 'billing_cycle' => $cycle, 'period_start' => $start->toIso8601String(), 'period_end' => $end->toIso8601String(),
                'days' => $days, 'unit_price' => Money::format($price), 'amount' => Money::format($amount), 'discount' => Money::format($discount)];
        }
        $sub = array_sum(array_map(fn ($l) => Money::toPaisa($l['amount']), $lines));
        $dis = array_sum(array_map(fn ($l) => Money::toPaisa($l['discount']), $lines));
        return ['lines' => $lines, 'subtotal' => Money::format($sub), 'discount' => Money::format($dis), 'tax' => '0.00', 'total' => Money::format($sub - $dis),
            'coupon_id' => $dis > 0 ? $running->coupon_id : null];
    }

    /** The latest end of another running paid module of the same cycle, if it lies after $start (the period this module joins) */
    private function anchor(array $subs, string $key, string $cycle, CarbonImmutable $start): ?CarbonImmutable
    {
        $best = null;
        foreach ($subs as $k => $s) {
            if ($k === $key || $s->billing_cycle !== $cycle || $s->status === 'cancelled' || $s->cancel_at_period_end || !$s->current_period_end) continue;
            $end = CarbonImmutable::parse($s->current_period_end);
            if ($end->greaterThan($start) && (!$best || $end->greaterThan($best))) $best = $end;
        }
        return $best;
    }

    private static function step(string $cycle): array { return $cycle === 'yearly' ? [1, 'year'] : [1, 'month']; }

    private static function days(CarbonImmutable $a, CarbonImmutable $b): int { return max(1, (int) ceil($a->diffInSeconds($b) / 86400)); }

    /** The institution's coupon whose discount months are still running (inside its Tenancy) */
    public function runningCoupon(): ?CouponRedemption
    {
        foreach (CouponRedemption::with('coupon')->whereNull('invoice_id')->orderByDesc('id')->get() as $r) {
            if ($r->created_at->copy()->addMonthsNoOverflow((int) $r->coupon->discount_months)->greaterThan(now())) return $r;
        }
        return null;
    }

    /** Redeem a coupon code for the current institution: every rule checked on the server under a row lock */
    public function redeem(Institution $institution, string $code): CouponRedemption
    {
        return Tenancy::as($institution, fn () => DB::transaction(function () use ($institution, $code) {
            $coupon = Coupon::where('code', strtoupper(trim($code)))->lockForUpdate()->first();
            $bad = fn (string $why) => new BusinessException($why, 'coupon_invalid', 422, ['reason' => $why]);
            if (!$coupon || $coupon->type !== 'percent') throw $bad('not_found');
            if ($coupon->status !== 'active') throw $bad('inactive');
            if (($coupon->valid_from && $coupon->valid_from->isAfter(today())) || ($coupon->valid_until && $coupon->valid_until->lt(today()))) throw $bad('expired');
            if ($coupon->max_redemptions !== null && $coupon->redeemed_count >= $coupon->max_redemptions) throw $bad('used_up');
            if (!empty($coupon->applies_to_types) && !in_array($institution->institution_type, $coupon->applies_to_types, true)) throw $bad('not_for_type');
            if (CouponRedemption::where('coupon_id', $coupon->id)->whereNull('invoice_id')->count() >= $coupon->per_institution_limit) throw $bad('already_used');
            if ($this->runningCoupon()) throw $bad('another_running');                                // one coupon at a time
            $coupon->increment('redeemed_count');
            $row = CouponRedemption::create(['coupon_id' => $coupon->id]);
            AuditLog::record('coupon.redeemed', $institution, ['coupon_id' => $coupon->id]);
            return $row->load('coupon');
        }));
    }

    /** Record a paid (or fully discounted) bill: payment, invoice, lines, coupon use, and each module's new period - once per ref */
    public function complete(Institution $institution, string $ref, array $quote, string $method, ?string $trxId, ?int $by): ?SubscriptionInvoice
    {
        return Tenancy::as($institution, fn () => DB::transaction(function () use ($institution, $ref, $quote, $method, $trxId, $by) {
            Institution::whereKey($institution->id)->lockForUpdate()->first();
            if (Payment::where('invoice_no', $ref)->exists()) return null;                             // a parallel or repeated callback
            $payment = Payment::create(['amount' => $quote['total'], 'method' => $method, 'trx_id' => $trxId, 'status' => 'completed', 'paid_at' => now(), 'invoice_no' => $ref]);
            $starts = array_map(fn ($l) => CarbonImmutable::parse($l['period_start']), $quote['lines']);
            $ends = array_map(fn ($l) => CarbonImmutable::parse($l['period_end']), $quote['lines']);
            $invoice = SubscriptionInvoice::create(['payment_id' => $payment->id, 'invoice_number' => 'INV-' . $ref, 'plan_name' => 'modules',
                'billing_period' => min($starts)->toDateString() . ' - ' . max($ends)->toDateString(), 'amount' => $quote['subtotal'], 'discount' => $quote['discount'],
                'coupon_id' => $quote['coupon_id'], 'tax' => '0.00', 'tax_rate' => '0.00', 'total' => $quote['total'], 'issued_at' => now()]);
            foreach ($quote['lines'] as $l) {
                SubscriptionInvoiceLine::create(['subscription_invoice_id' => $invoice->id, 'module_key' => $l['module_key'], 'billing_cycle' => $l['billing_cycle'],
                    'period_start' => CarbonImmutable::parse($l['period_start'])->toDateString(), 'period_end' => CarbonImmutable::parse($l['period_end'])->toDateString(),
                    'days' => $l['days'], 'unit_price' => $l['unit_price'], 'amount' => $l['amount'], 'discount' => $l['discount']]);
                InstitutionModuleSubscription::where('module_key', $l['module_key'])->update(['billing_cycle' => $l['billing_cycle'],
                    'current_period_end' => CarbonImmutable::parse($l['period_end']), 'status' => 'active', 'cancel_at_period_end' => false]);
            }
            if ($quote['coupon_id']) CouponRedemption::create(['coupon_id' => $quote['coupon_id'], 'payment_id' => $payment->id, 'invoice_id' => $invoice->id, 'discount_amount' => $quote['discount']]);
            AuditLog::create(['institution_id' => $institution->id, 'user_id' => $by, 'action' => 'subscription.paid', 'model' => 'SubscriptionInvoice',
                'model_id' => $invoice->id, 'new_data' => ['modules' => array_column($quote['lines'], 'module_key'), 'gateway' => $method], 'ip_address' => request()->ip()]);
            return $invoice;
        }));
    }
}
