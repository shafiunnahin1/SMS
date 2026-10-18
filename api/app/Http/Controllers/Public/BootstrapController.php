<?php

namespace App\Http\Controllers\Public;

use App\Http\Controllers\Controller;
use App\Models\Institution;
use App\Services\InstitutionSettings;
use App\Services\ModuleGate;
use App\Services\ThemeService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\Cache;

// GET /api/v1/bootstrap - public, pre-auth, tenant from the Host. The SPA loads it once per session
// (docs/modules/institution-types.md "Bootstrap Endpoint"); cached as bootstrap:{institution_id} for 10 minutes.
class BootstrapController extends Controller
{
    public function __construct(private ThemeService $themes, private ModuleGate $gate, private InstitutionSettings $settings) {}

    public function show()
    {
        $i = Tenancy::current();
        if (!$i) {
            return response()->json(['success' => true, 'data' => [
                'is_central' => true,
                'theme'      => $this->themes->defaultTheme(),
                'locales'    => ['default' => 'bn', 'enabled' => InstitutionSettings::LOCALES, 'dir' => $this->dirs(InstitutionSettings::LOCALES)],
                'release'    => ['id' => config('release.id')],
                'google_client_id' => config('services.google.client_id') ?: null,   // R2.1.1 / D111: public OAuth client ID; null hides the button
            ]]);
        }

        return response()->json(['success' => true, 'data' => Cache::remember("bootstrap:{$i->id}", 600, fn () => $this->forInstitution($i))]);
    }

    private function forInstitution(Institution $i): array
    {
        $lang = $this->settings->language($i);
        $plan = $i->plan;
        return [
            'institution' => $i->only(['id', 'name', 'slug', 'institution_type', 'status']),
            'terms'       => $this->terms($i),
            'locales'     => ['default' => $lang['default'], 'enabled' => $lang['enabled'], 'dir' => $this->dirs($lang['enabled'])],
            'modules'     => $this->gate->enabledModules($i),
            'roles'       => array_values(array_intersect(config("institution_types.{$i->institution_type}.roles", []), config('release.roles', []))),
            'theme'       => $this->themes->getTheme($i),
            'plan'        => $plan ? ['name' => $plan->name, 'white_label' => $this->gate->feature($i, 'white_label'), 'features' => $plan->features ?? []] : null,
            'settings'    => $this->settings->publicSettings($i),
            'release'     => ['id' => config('release.id')],
            'google_client_id' => config('services.google.client_id') ?: null,
            'is_central'  => false,
        ];
    }

    /** Type defaults merged with the institution's overrides, per key and locale */
    private function terms(Institution $i): array
    {
        $out = [];
        foreach (config("institution_types.{$i->institution_type}.terms", []) as $key => $byLocale) {
            $out[$key] = array_merge($byLocale, ($i->terminology ?? [])[$key] ?? []);
        }
        return $out;
    }

    private function dirs(array $locales): array
    {
        return array_intersect_key(InstitutionSettings::DIR, array_flip($locales));
    }
}
