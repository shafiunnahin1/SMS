<?php

namespace App\Http\Controllers\Billing;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{Institution, SmsCreditTransaction};
use App\Services\Billing\SubscriptionBillingService;
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// D218 WAL.2 (amends D187 (4)): the admin pays the chosen modules' bill from the central wallet. One transaction: the institution
// row is locked, the whole total is taken (never below zero - else 422 `wallet_insufficient`), a ledger row of type `subscription`
// is written and the bill is recorded exactly as a paid checkout was (payment, invoice, lines, coupon, each module's new period).
// Nothing is ever taken automatically.
class WalletSubscriptionController extends Controller
{
    public function __construct(private SubscriptionBillingService $billing) {}

    /** POST /subscription/pay-from-wallet {items: [{module_key, billing_cycle}]} */
    public function pay(Request $request)
    {
        $items = $request->validate(['items' => 'required|array|min:1|max:60', 'items.*.module_key' => 'required|string|max:50',
            'items.*.billing_cycle' => 'required|in:monthly,yearly', 'amount' => 'prohibited', 'total' => 'prohibited'])['items'];
        $i = Tenancy::current();
        $quote = $this->billing->quote($i, $items);
        $ref = 'SUB' . $i->id . 'W' . strtoupper(Str::random(8));                               // <= 20 chars, [A-Z0-9]
        $total = Money::toPaisa($quote['total']);
        if ($total === 0 && !$quote['coupon_id']) throw new BusinessException('nothing to pay', 'nothing_to_pay', 422);

        $invoice = DB::transaction(function () use ($i, $quote, $ref, $total, $request) {
            $locked = Institution::whereKey($i->id)->lockForUpdate()->first();
            $balance = Money::toPaisa((string) $locked->sms_balance);
            if ($total > $balance) throw new BusinessException('the wallet balance is not enough', 'wallet_insufficient', 422, ['balance' => Money::format($balance), 'total' => $quote['total']]);
            if ($total > 0) {
                $locked->forceFill(['sms_balance' => Money::format($balance - $total)])->save();
                SmsCreditTransaction::create(['type' => 'subscription', 'amount' => Money::format(-$total), 'balance_after' => Money::format($balance - $total), 'reference' => 'INV-' . $ref, 'created_by' => $request->user()->id]);
            }
            return $this->billing->complete($i, $ref, $quote, $total > 0 ? 'wallet' : 'coupon', null, $request->user()->id);
        });
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['paid' => true, 'invoice_number' => $invoice->invoice_number, 'total' => $quote['total'],
            'balance' => (string) $i->refresh()->sms_balance]]);
    }
}
