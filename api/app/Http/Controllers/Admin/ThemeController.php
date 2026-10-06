<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateThemeRequest;
use App\Http\Requests\Admin\UploadLogoRequest;
use App\Services\ModuleGate;
use App\Services\ThemeService;

// Institution Admin, own institution. Logo: every plan. Brand colours / mode: `custom_branding` (docs/THEMING.md "Subscription Plan Gating").
class ThemeController extends Controller
{
    public function __construct(private ThemeService $themes, private ModuleGate $gate) {}

    public function show()
    {
        $i = app('currentInstitution');
        return response()->json(['success' => true, 'data' => [
            'theme' => $this->themes->getTheme($i),
            'can_customize' => $this->gate->feature($i, 'custom_branding'),
        ]]);
    }

    public function update(UpdateThemeRequest $request)
    {
        $i = app('currentInstitution');
        if (!$this->gate->feature($i, 'custom_branding')) {
            return response()->json(['success' => false, 'error' => 'feature_not_available', 'feature' => 'custom_branding',
                'message' => 'Theme customization is not available for your institution'], 403);
        }
        $updated = $this->themes->update($i, $request->validated(), $request->user()->id);
        return response()->json(['success' => true, 'data' => ['theme' => $this->themes->getTheme($updated)], 'message' => 'Theme updated']);
    }

    public function logo(UploadLogoRequest $request)
    {
        $url = $this->themes->uploadLogo(app('currentInstitution'), $request->file('logo'), $request->user()->id);
        return response()->json(['success' => true, 'data' => ['logo_url' => $url], 'message' => 'Logo uploaded']);
    }
}
