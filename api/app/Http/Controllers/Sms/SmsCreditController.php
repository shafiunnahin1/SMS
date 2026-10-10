<?php

namespace App\Http\Controllers\Sms;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Institution, SmsCreditTransaction};
use App\Services\SmsService;
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// GET /subscription/sms-credits (admin): the wallet and its ledger (Step 4.6, in taka since D56). Step 5.3 (D58): the Super
// Admin adds or corrects money by hand (`adjust`, an `adjustment` row); the online recharge (`purchase`) is bKash.
class SmsCreditController extends Controller
{
    public function balance(Request $request, SmsService $sms)
    {
        $f = $request->validate(['per_page' => 'nullable|integer|min:1|max:100', 'cursor' => 'nullable|string|max:500']);
        $page = SmsCreditTransaction::orderByDesc('id')->cursorPaginate($f['per_page'] ?? 50);
        return response()->json(['success' => true, 'data' => $sms->usage(Tenancy::current()) + [
            'transactions' => collect($page->items())->map(fn ($t) => ['id' => $t->id, 'type' => $t->type, 'quantity' => (int) $t->quantity, 'amount' => $t->amount,
                'balance_after' => $t->balance_after, 'reference' => $t->reference, 'created_at' => $t->created_at?->toIso8601String()])->values(),
        ], 'meta' => ['next_cursor' => $page->nextCursor()?->encode(), 'per_page' => $page->perPage()]]);
    }

    /** POST /super/institutions/{id}/sms-credits {amount, note} (central host, super_admin): + adds, - corrects; never below 0 */
    public function adjust(Request $request, int $id)
    {
        $f = $request->validate(['amount' => ['required', 'numeric', 'regex:/^-?\d{1,6}(\.\d{1,2})?$/', 'not_in:0'], 'note' => 'required|string|max:90']);
        $i = Institution::findOrFail($id);
        $delta = Money::toPaisa((string) $f['amount']);
        $row = Tenancy::as($i, fn () => DB::transaction(function () use ($i, $delta, $f, $request) {
            $locked = Institution::whereKey($i->id)->lockForUpdate()->first();
            $balance = Money::toPaisa((string) $locked->sms_balance) + $delta;
            if ($balance < 0) throw new BusinessException('the wallet cannot go below zero', 'sms_balance_negative', 422);
            $locked->forceFill(['sms_balance' => Money::format($balance)])->save();
            $row = SmsCreditTransaction::create(['type' => 'adjustment', 'amount' => Money::format($delta), 'balance_after' => Money::format($balance),
                'reference' => 'admin: ' . $f['note'], 'created_by' => $request->user()->id]);
            AuditLog::record('sms_wallet.adjusted', $locked, ['amount' => Money::format($delta)]);
            return $row;
        }));
        return response()->json(['success' => true, 'data' => ['balance' => $row->balance_after, 'transaction' => ['id' => $row->id, 'type' => $row->type,
            'amount' => $row->amount, 'balance_after' => $row->balance_after, 'reference' => $row->reference]], 'message' => __('messages.saved')]);
    }
}
