<?php

namespace App\Support;

use Closure;

// D65 (docs/modules/question-bank.md §2): the platform question-bank catalogue (qb_* tables WITHOUT institution_id) is
// written only from the central host - by writers, moderators and the Super Admin - and only READ from an institution's host.
// "Restricted" = a tenant is bound and not bypassed (an institution's request, a TenantAwareJob). Outside that (central host,
// Tenancy::withoutTenancy(), CLI) the catalogue is open; the controllers there check the role.
final class Catalogue
{
    private static int $platform = 0;

    public static function restricted(): bool
    {
        return self::$platform === 0 && !Tenancy::isBypassed() && Tenancy::current() !== null;
    }

    /** The ONE named exit for a platform write made during an institution's request - e.g. the writer's earning booked in the
     *  same transaction as the institution's purchase (§৪.৫). Greppable; TenancyArchitectureTest allows it only in listed files. */
    public static function asPlatform(Closure $fn): mixed
    {
        self::$platform++;
        try { return $fn(); } finally { self::$platform--; }
    }
}
