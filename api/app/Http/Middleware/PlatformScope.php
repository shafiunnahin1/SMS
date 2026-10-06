<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// Alias `tenancy.bypass` - registered ONLY on the central-host /super group. Inside it a tenant-scoped row can only be
// created with an explicit institution_id (BelongsToInstitution throws otherwise).
class PlatformScope
{
    public function handle(Request $request, Closure $next)
    {
        abort_unless($request->user()?->role === 'super_admin' && !\App\Support\Tenancy::current(), 403);
        return \App\Support\Tenancy::withoutTenancy(fn () => $next($request));
    }
}
