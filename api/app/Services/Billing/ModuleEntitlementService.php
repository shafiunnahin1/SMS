<?php

namespace App\Services\Billing;

use App\Models\Institution;
use App\Models\InstitutionModuleSubscription;
use App\Support\Tenancy;
use Carbon\CarbonInterface;

// D187 SUB.1: what an institution may do with a paid module. Free modules (the foundation, usage-billed SMS), exempt types and
// a Super Admin override (D6) are always full. Otherwise the subscription's end (trial end, or the paid period's end) decides:
// before it full, up to 7 days after it grace (full, with warnings), later read-only. A cancelled module is read-only too -
// data is never deleted. The state is computed from the dates, so it never depends on the daily refresh having run.
class ModuleEntitlementService
{
    public const FULL = ['trial', 'active', 'grace', 'free'];

    public function isPaidModule(Institution $institution, string $module): bool
    {
        if (in_array($institution->institution_type, config('subscriptions.exempt_types', []), true)) return false;
        if (in_array($module, config('subscriptions.free_modules', []), true)) return false;
        return in_array($module, config("institution_types.{$institution->institution_type}.modules", []), true);
    }

    /** free | trial | active | grace | read_only */
    public function state(Institution $institution, string $module): string
    {
        if (!$this->isPaidModule($institution, $module)) return 'free';
        if (($institution->enabled_modules[$module] ?? null) !== null) return 'free';   // Super Admin override (D6) comes first
        return self::effective($this->subscription($institution, $module));
    }

    public function writable(Institution $institution, string $module): bool
    {
        return in_array($this->state($institution, $module), self::FULL, true);
    }

    public static function effective(InstitutionModuleSubscription $s, ?CarbonInterface $now = null): string
    {
        $now ??= now();
        if ($s->status === 'cancelled') return 'read_only';
        $paid = $s->current_period_end !== null;
        $end = $paid ? $s->current_period_end : $s->trial_ends_at;
        if ($end === null) return 'read_only';
        if ($now->lessThanOrEqualTo($end)) return $paid ? 'active' : 'trial';
        if ($s->cancel_at_period_end) return 'read_only';                              // removed from the next period
        return $now->lessThanOrEqualTo($end->copy()->addDays((int) config('subscriptions.grace_days', 7))) ? 'grace' : 'read_only';
    }

    /** The row, created as a fresh 30-day trial when missing (a new institution, or a module new to its type) */
    public function subscription(Institution $institution, string $module): InstitutionModuleSubscription
    {
        return Tenancy::as($institution, fn () => InstitutionModuleSubscription::firstOrCreate(['module_key' => $module],
            ['status' => 'trial', 'trial_ends_at' => now()->addDays((int) config('subscriptions.trial_days', 30))]));
    }

    /** Every paid module of the institution's type with its row (creating missing trials) */
    public function all(Institution $institution): array
    {
        if (in_array($institution->institution_type, config('subscriptions.exempt_types', []), true)) return [];
        $keys = array_values(array_diff(config("institution_types.{$institution->institution_type}.modules", []), config('subscriptions.free_modules', [])));
        return array_combine($keys, array_map(fn ($k) => $this->subscription($institution, $k), $keys)) ?: [];
    }
}
