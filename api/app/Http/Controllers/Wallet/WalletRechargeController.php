<?php

namespace App\Http\Controllers\Wallet;

use App\Http\Controllers\Controller;
use App\Models\{PlatformSetting, WalletRechargeRequest};
use App\Services\Wallet\WalletRechargeService;
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D218 WAL.1: the institution's admin tops up the central wallet by hand - where to send (the Super Admin's instructions), the
// request with the receipt, the list of requests and their receipts.
class WalletRechargeController extends Controller
{
    public function __construct(private WalletRechargeService $wallet) {}

    /** GET /wallet/recharge-requests - the instructions, the balance and this institution's requests */
    public function index()
    {
        $rows = WalletRechargeRequest::whereNull('user_id')->orderByDesc('id')->limit(100)->get();
        return response()->json(['success' => true, 'data' => ['instructions' => (string) PlatformSetting::read('wallet_recharge_instructions', ''), 'methods' => WalletRechargeRequest::METHODS,
            'min' => WalletRechargeService::MIN, 'balance' => (string) Tenancy::current()->refresh()->sms_balance, 'requests' => $rows->map(fn ($r) => self::row($r))->values()]]);
    }

    /** POST /wallet/recharge-requests (multipart: amount, method, trx_reference, note?, receipt) */
    public function store(Request $request)
    {
        $d = $request->validate(['amount' => ['required', 'regex:/^\d{1,6}(\.\d{1,2})?$/'], 'method' => ['required', Rule::in(WalletRechargeRequest::METHODS)],
            'trx_reference' => 'required|string|min:4|max:100', 'note' => 'nullable|string|max:255', 'receipt' => 'required|file|max:5120|mimes:jpg,jpeg,png,pdf']);
        $r = $this->wallet->file($request->user(), $d, $request->file('receipt'));
        return response()->json(['success' => true, 'message' => __('wallet.requested'), 'data' => self::row($r)], 201);
    }

    /** GET /wallet/recharge-requests/{id}/receipt */
    public function receipt(int $id)
    {
        return $this->wallet->receipt(WalletRechargeRequest::whereNull('user_id')->findOrFail($id));
    }

    public static function row(WalletRechargeRequest $r): array
    {
        return ['id' => $r->id, 'amount' => $r->amount, 'method' => $r->method, 'trx_reference' => $r->trx_reference, 'note' => $r->note, 'status' => $r->status,
            'decision_note' => $r->decision_note, 'created_at' => $r->created_at?->toIso8601String(), 'decided_at' => $r->decided_at?->toIso8601String(), 'has_receipt' => (bool) $r->receipt_path];
    }
}
