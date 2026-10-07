<?php

namespace App\Http\Middleware;

use App\Services\ModuleGate;
use Closure;
use Illuminate\Http\Request;

// `module:x` - runs after `tenant`. Without the plan step (D47) every refusal is `module_disabled`.
class ModuleMiddleware
{
    public function __construct(private ModuleGate $gate) {}

    public function handle(Request $request, Closure $next, string $module)
    {
        if (!$this->gate->allows(app('currentInstitution'), $module)) {
            return response()->json(['success' => false, 'error' => 'module_disabled', 'message' => __('errors.module_disabled'), 'module' => $module], 403);
        }
        return $next($request);
    }
}
