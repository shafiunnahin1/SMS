<?php

namespace App\Http\Controllers\Wallet;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, PlatformSetting, WalletRechargeRequest};
use App\Services\Wallet\WalletRechargeService;
use App\Support\Tenancy;
use Illuminate\Http\Request;

// D218 WAL.1 (central host, Super Admin): the payment instructions shown on every top-up page, and the queue of manual top-ups
// of every institution - see the receipt, approve (credits the wallet once) or reject with a reason.
class SuperWalletRechargeController extends Controller
{
    public function __construct(private WalletRechargeService $wallet) {}

    /** GET /super/wallet/recharge-requests?status= */
    public function index(Request $request)
    {
        $f = $request->validate(['status' => 'nullable|in:pending,approved,rejected']);
        $rows = WalletRechargeRequest::anyInstitution()->with('institution:id,name')->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))->orderByDesc('id')->limit(500)->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($r) => WalletRechargeController::row($r) + ['institution' => ['id' => $r->institution_id, 'name' => $r->institution?->name],
            'wallet' => $r->user_id ? 'student' : 'institution'])->values()]);
    }

    /** GET /super/wallet/recharge-requests/{id}/receipt */
    public function receipt(int $id)
    {
        $r = WalletRechargeRequest::anyInstitution()->findOrFail($id);
        return Tenancy::as($r->institution()->firstOrFail(), fn () => $this->wallet->receipt($r));
    }

    /** POST /super/wallet/recharge-requests/{id}/approve {note?} */
    public function approve(Request $request, int $id)
    {
        $d = $request->validate(['note' => 'nullable|string|max:255']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => WalletRechargeController::row($this->wallet->decide($id, $request->user(), true, $d['note'] ?? null))]);
    }

    /** POST /super/wallet/recharge-requests/{id}/reject {reason} */
    public function reject(Request $request, int $id)
    {
        $d = $request->validate(['reason' => 'required|string|max:255']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => WalletRechargeController::row($this->wallet->decide($id, $request->user(), false, $d['reason']))]);
    }

    /** GET /super/wallet/instructions */
    public function instructions()
    {
        return response()->json(['success' => true, 'data' => ['instructions' => (string) PlatformSetting::read('wallet_recharge_instructions', '')]]);
    }

    /** PUT /super/wallet/instructions {instructions} */
    public function updateInstructions(Request $request)
    {
        $d = $request->validate(['instructions' => 'present|nullable|string|max:3000']);
        PlatformSetting::write('wallet_recharge_instructions', (string) ($d['instructions'] ?? ''), $request->user()->id);
        AuditLog::create(['institution_id' => null, 'user_id' => $request->user()->id, 'action' => 'wallet.instructions_updated', 'model' => 'PlatformSetting', 'model_id' => null, 'ip_address' => $request->ip()]);
        return $this->instructions();
    }
}
