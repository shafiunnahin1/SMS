<?php

namespace App\Http\Middleware;

use App\Services\ModuleGate;
use Closure;
use Illuminate\Http\Request;

// `feature:x` for non-module flags (custom_branding, two_factor, ...) - runs after `tenant`
class FeatureMiddleware
{
    public function __construct(private ModuleGate $gate) {}

    public function handle(Request $request, Closure $next, string $feature)
    {
        if (!$this->gate->feature(app('currentInstitution'), $feature)) {
            return response()->json(['success' => false, 'error' => 'feature_not_available', 'message' => __('errors.feature_not_available'), 'feature' => $feature], 403);
        }
        return $next($request);
    }
}
