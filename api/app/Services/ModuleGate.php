<?php

namespace App\Services;

use App\Models\Institution;

// One function, used everywhere (docs/modules/institution-types.md "Module Gate").
// D47: the plan step is gone - no plan decides whether a module is on (docs/PRICING-MODEL.md PM-1 re-specifies entitlements).
class ModuleGate
{
    public function allows(Institution $institution, string $module): bool
    {
        // 0. RELEASE GATE: a module this build has not shipped is off for EVERYONE - a Super Admin override cannot switch on code that does not exist.
        if (!in_array($module, config('release.modules', []), true)) return false;

        // 1. Super Admin per-institution override always wins
        $override = $institution->enabled_modules[$module] ?? null;
        if ($override !== null) return (bool) $override;

        // 2. Institution type must include the module
        $typeModules = config("institution_types.{$institution->institution_type}.modules", []);
        if (!in_array($module, $typeModules, true)) return false;

        // 2b. OPT-IN modules are off until the institution turns them on (institutions.settings.opt_in_modules)
        if (in_array($module, config('institution_types.opt_in', []), true)
            && !in_array($module, $institution->settings['opt_in_modules'] ?? [], true)) return false;

        return true;
    }

    /** Non-module flags: custom_branding, custom_domain, custom_subdomain, white_label, whatsapp, two_factor */
    public function feature(Institution $institution, string $flag): bool
    {
        $override = $institution->enabled_modules[$flag] ?? null;
        if ($override !== null) return (bool) $override;
        return (bool) ($institution->plan?->features[$flag] ?? false);
    }

    /** List sent to the frontend in /bootstrap */
    public function enabledModules(Institution $institution): array
    {
        $all = collect(config('institution_types'))->except('opt_in')->pluck('modules')->flatten()->unique();
        return $all->filter(fn ($m) => $this->allows($institution, $m))->values()->all();
    }
}
