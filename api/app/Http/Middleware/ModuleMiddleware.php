<?php

namespace App\Http\Middleware;

use App\Services\Billing\ModuleEntitlementService;
use App\Services\ModuleGate;
use Closure;
use Illuminate\Http\Request;

// `module:x` - runs after `tenant`. Without the plan step (D47) every refusal is `module_disabled`. D187 SUB.1: a paid module whose
// trial/period and grace have run out is read-only - reads pass, writes get 402 `module_read_only` (data is never deleted).
class ModuleMiddleware
{
    public function __construct(private ModuleGate $gate, private ModuleEntitlementService $entitlements) {}

    public function handle(Request $request, Closure $next, string $module)
    {
        if (!$this->gate->allows(app('currentInstitution'), $module)) {
            return response()->json(['success' => false, 'error' => 'module_disabled', 'message' => __('errors.module_disabled'), 'module' => $module], 403);
        }
        if (!in_array($request->method(), ['GET', 'HEAD', 'OPTIONS'], true) && !$this->entitlements->writable(app('currentInstitution'), $module)) {
            return response()->json(['success' => false, 'error' => 'module_read_only', 'message' => __('errors.module_read_only'), 'module' => $module], 402);
        }
        return $next($request);
    }
}
