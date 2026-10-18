<?php

namespace App\Support;

use App\Models\Institution;
use Closure;

final class Tenancy
{
    private static int $bypass = 0;

    public static function current(): ?Institution
    {
        return app()->bound('currentInstitution') ? app('currentInstitution') : null;
    }

    public static function isBypassed(): bool { return self::$bypass > 0; }

    /** Run $fn AS $institution and ALWAYS restore the previous state - even on exceptions.
     *  Mandatory in jobs/commands/webhooks: queue workers are long-lived, so a binding left behind by job A would be
     *  silently used by job B of another institution. Never call app()->instance('currentInstitution', …) in application code
     *  (TenantMiddleware and one-shot CLI seeders are the only exceptions). */
    public static function as(Institution $institution, Closure $fn): mixed
    {
        $prev = self::current();
        $prevBypass = self::$bypass;
        self::$bypass = 0;                                   // an explicit tenant cancels an outer bypass
        app()->instance('currentInstitution', $institution);
        try {
            return $fn($institution);
        } finally {
            self::$bypass = $prevBypass;
            $prev ? app()->instance('currentInstitution', $prev) : app()->forgetInstance('currentInstitution');
        }
    }

    /** See ALL institutions on purpose (Super Admin screens, scheduler fan-out, tenant lookup by host/ref, platform reports).
     *  Keep the closure small and name what you are doing - reviewers and TenancyArchitectureTest look for this call. */
    public static function withoutTenancy(Closure $fn): mixed
    {
        self::$bypass++;
        try { return $fn(); } finally { self::$bypass--; }
    }

    /** Fan-out: run $fn once per active institution, each inside its own Tenancy::as() */
    public static function each(Closure $fn): void
    {
        foreach (Institution::whereIn('status', ['trial', 'active'])->cursor() as $institution) {
            self::as($institution, fn () => $fn($institution));
        }
    }
}
