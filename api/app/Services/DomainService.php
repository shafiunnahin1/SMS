<?php

namespace App\Services;

use App\Models\Institution;

// docs/modules/custom-domain.md "primaryUrl": the URL used in every SMS, email, PDF QR code and payment redirect.
// Release 1 has no custom domains (institution_domains is a later release), so it is always the institution's subdomain;
// the custom-domain branch arrives with that module.
class DomainService
{
    public function primaryUrl(Institution $institution): string
    {
        return 'https://' . $institution->slug . '.' . config('tenancy.base_domain');
    }
}
