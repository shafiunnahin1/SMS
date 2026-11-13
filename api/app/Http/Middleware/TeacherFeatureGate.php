<?php

namespace App\Http\Middleware;

use App\Services\Access\TeacherFeatures;
use Closure;
use Illuminate\Http\Request;

// D205 PERM.1: a teacher's switched-off feature answers 403 `feature_off` on its routes (after auth, before the controller and any
// validation). Other roles and the never-switchable teacher routes pass untouched.
class TeacherFeatureGate
{
    public function __construct(private TeacherFeatures $features) {}

    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        if ($user?->role === 'teacher' && app()->bound('currentInstitution')) {
            $key = $this->features->forRequest($request);
            if ($key && in_array($key, $this->features->offFor($user, app('currentInstitution')), true)) {
                return response()->json(['success' => false, 'error' => 'feature_off', 'message' => __('errors.feature_off'), 'feature' => $key], 403);
            }
        }
        return $next($request);
    }
}
