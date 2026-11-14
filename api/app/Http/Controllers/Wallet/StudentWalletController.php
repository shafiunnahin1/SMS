<?php

namespace App\Http\Controllers\Wallet;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{PlatformSetting, UserWalletTransaction, WalletRechargeRequest};
use App\Services\Billing\BkashService;
use App\Services\Wallet\{StudentWalletService, WalletRechargeService};
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

// D218 WAL.3: a student's own wallet - the balance and ledger, a manual top-up with the receipt (a Super Admin decides, as for the
// institution wallet) and a bKash top-up on the platform's merchant (the D58 flow; the wallet is credited only by the callback).
class StudentWalletController extends Controller
{
    public function __construct(private StudentWalletService $wallets, private WalletRechargeService $recharges) {}

    /** GET /student/wallet */
    public function show(Request $request)
    {
        $u = $request->user();
        $w = $this->wallets->wallet($u);
        $rows = UserWalletTransaction::where('user_id', $u->id)->orderByDesc('id')->limit(100)->get();
        $requests = WalletRechargeRequest::where('user_id', $u->id)->orderByDesc('id')->limit(50)->get();
        return response()->json(['success' => true, 'data' => ['balance' => (string) $w->balance, 'min' => WalletRechargeService::MIN, 'methods' => WalletRechargeRequest::METHODS,
            'instructions' => (string) PlatformSetting::read('wallet_recharge_instructions', ''), 'bkash' => app(BkashService::class)->configured(),
            'transactions' => $rows->map(fn ($t) => ['id' => $t->id, 'type' => $t->type, 'amount' => (string) $t->amount, 'balance_after' => (string) $t->balance_after, 'created_at' => $t->created_at?->toIso8601String()])->values(),
            'requests' => $requests->map(fn ($r) => WalletRechargeController::row($r))->values()]]);
    }

    /** POST /student/wallet/recharge-requests (multipart: amount, method, trx_reference, note?, receipt) */
    public function request(Request $request)
    {
        $d = $request->validate(['amount' => ['required', 'regex:/^\d{1,6}(\.\d{1,2})?$/'], 'method' => ['required', Rule::in(WalletRechargeRequest::METHODS)],
            'trx_reference' => 'required|string|min:4|max:100', 'note' => 'nullable|string|max:255', 'receipt' => 'required|file|max:5120|mimes:jpg,jpeg,png,pdf']);
        $r = $this->recharges->file($request->user(), $d, $request->file('receipt'), $request->user()->id);
        return response()->json(['success' => true, 'message' => __('wallet.requested'), 'data' => WalletRechargeController::row($r)], 201);
    }

    /** POST /student/wallet/bkash {amount} - start a bKash top-up; the amount is kept on our side under a short ref */
    public function bkash(Request $request, BkashService $bkash)
    {
        $f = $request->validate(['amount' => ['required', 'regex:/^\d{1,6}(\.\d{1,2})?$/']]);
        $paisa = Money::toPaisa((string) $f['amount']);
        if ($paisa < Money::toPaisa(WalletRechargeService::MIN) || $paisa > Money::toPaisa('50000.00')) throw new BusinessException('amount out of range', 'wallet_amount_range', 422, ['min' => WalletRechargeService::MIN, 'max' => '50000.00']);
        if (!$bkash->configured()) throw new BusinessException('bKash is not configured', 'recharge_unavailable', 503);
        $amount = Money::format($paisa);
        $ref = 'UW' . $request->user()->id . 'R' . strtoupper(Str::random(8));
        $ref = substr($ref, 0, 20);
        $base = PlatformSetting::read('bkash_callback_base') ?: config('app.url');
        $payment = $bkash->createPayment($amount, $ref, rtrim((string) $base, '/') . '/api/v1/wallet/student/bkash/callback?ref=' . $ref);
        if (!$payment) return response()->json(['success' => false, 'error' => 'recharge_failed', 'message' => __('errors.recharge_failed')], 502);
        $back = $request->headers->get('origin');
        Cache::put("user_wallet_recharge:{$ref}", ['institution_id' => Tenancy::current()->id, 'user_id' => $request->user()->id, 'amount' => $amount, 'payment_id' => $payment['paymentID'],
            'return' => ($back && parse_url($back, PHP_URL_HOST) === $request->getHost()) ? $back : $request->getSchemeAndHttpHost()], now()->addDay());
        return response()->json(['success' => true, 'data' => ['bkash_url' => $payment['bkashURL'], 'ref' => $ref, 'amount' => $amount]]);
    }
}
