<?php

namespace App\Http\Controllers\SuperAdmin;

use App\Http\Controllers\Controller;
use App\Models\{Institution, InstitutionModuleSubscription};
use App\Services\Billing\ModuleEntitlementService;
use App\Support\Tenancy;
use Illuminate\Http\Request;

// D187 SUB.3: the Super Admin's view of every institution's module subscriptions - how many modules are in trial, paid, grace or
// read-only and when the next one ends. Read only: each institution is read inside its own Tenancy; nothing is created.
class SubscriptionStatusController extends Controller
{
    public function index(Request $request)
    {
        $f = $request->validate(['page' => 'nullable|integer|min:1', 'state' => 'nullable|in:trial,active,grace,read_only']);
        $page = Institution::whereNotIn('institution_type', config('subscriptions.exempt_types', []))->orderBy('id')->paginate(50, ['*'], 'page', $f['page'] ?? 1);
        $rows = [];
        foreach ($page->items() as $i) {
            $counts = ['trial' => 0, 'active' => 0, 'grace' => 0, 'read_only' => 0];
            $next = null;
            foreach (Tenancy::as($i, fn () => InstitutionModuleSubscription::get()) as $s) {
                $counts[ModuleEntitlementService::effective($s)]++;
                $end = $s->current_period_end ?? $s->trial_ends_at;
                if ($end && $end->isFuture() && (!$next || $end->lt($next))) $next = $end;
            }
            if (!empty($f['state']) && $counts[$f['state']] === 0) continue;
            $rows[] = ['id' => $i->id, 'name' => $i->name, 'institution_type' => $i->institution_type, 'status' => $i->status, 'counts' => $counts,
                'next_end' => $next?->toIso8601String()];
        }
        return response()->json(['success' => true, 'data' => $rows, 'meta' => ['page' => $page->currentPage(), 'last_page' => $page->lastPage()]]);
    }
}
