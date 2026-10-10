<?php

namespace App\Http\Controllers\Sms;

use App\Http\Controllers\Controller;
use App\Models\SmsCreditTransaction;
use App\Services\SmsService;
use App\Support\Tenancy;
use Illuminate\Http\Request;

// GET /subscription/sms-credits (admin) - Step 4.6 scope ("balance view"). Buying credit (POST, `purchase`) and the Super Admin
// adjustment belong to Step 5.2, which is BLOCKED (D47) - not built here.
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
}
