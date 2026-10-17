<?php

namespace App\Services\Tenancy;

use App\Models\Institution;
use Illuminate\Support\Facades\Cache;

// Release 1 resolves platform subdomains only. Custom domains (institution_domains, docs/modules/custom-domain.md)
// belong to a later release; until then any other host resolves to no institution.
class TenantResolver
{
    public function isCentralHost(string $host): bool
    {
        return in_array($host, config('tenancy.central_domains'), true);
    }

    public function resolve(string $host): ?Institution
    {
        $id = Cache::remember("tenant:host:{$host}", 600, fn () => $this->lookupId($host));

        return $id ? Institution::find($id) : null;
    }

    private function lookupId(string $host): ?int
    {
        $base = '.' . config('tenancy.base_domain');

        // Platform subdomain: {slug}.APP_BASE_DOMAIN (exactly one label)
        if (str_ends_with($host, $base)) {
            $slug = substr($host, 0, -strlen($base));
            if ($slug === '' || str_contains($slug, '.')
                || in_array($slug, config('tenancy.reserved_slugs'), true)) {
                return null;
            }
            return Institution::where('slug', $slug)->value('id');
        }

        return null;
    }

    public function forget(string $host): void
    {
        Cache::forget("tenant:host:{$host}");
    }
}
