<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UpdateGeneralSettingsRequest;
use App\Http\Requests\Admin\UpdateLanguageRequest;
use App\Http\Requests\Admin\UpdateSettingsRequest;
use App\Services\InstitutionSettings;
use App\Services\ThemeService;

// Institution Admin settings for the CURRENT institution only (the tenant bound from the Host)
class SettingController extends Controller
{
    public function __construct(private InstitutionSettings $settings) {}

    /** GET /settings - the institution profile */
    public function index()
    {
        return response()->json(['success' => true, 'data' => $this->profile()]);
    }

    public function update(UpdateSettingsRequest $request)
    {
        $i = app('currentInstitution');
        $i->forceFill($request->validated())->save();
        app(ThemeService::class)->flush($i);
        return response()->json(['success' => true, 'data' => $this->profile(), 'message' => __('messages.saved')]);
    }

    public function general()
    {
        return response()->json(['success' => true, 'data' => $this->settings->general(app('currentInstitution'))]);
    }

    public function updateGeneral(UpdateGeneralSettingsRequest $request)
    {
        $i = app('currentInstitution');
        $this->settings->merge($i, $request->validated());
        return response()->json(['success' => true, 'data' => $this->settings->general($i->fresh()), 'message' => __('messages.saved')]);
    }

    public function language()
    {
        return response()->json(['success' => true, 'data' => $this->settings->language(app('currentInstitution'))]);
    }

    public function updateLanguage(UpdateLanguageRequest $request)
    {
        $i = app('currentInstitution');
        $this->settings->merge($i, [
            'locales' => array_values(array_unique($request->input('enabled'))),
            'default_locale' => $request->input('default'),
            'sms_locale' => $request->input('sms_locale') ?? $request->input('default'),
        ]);
        return response()->json(['success' => true, 'data' => $this->settings->language($i->fresh()), 'message' => __('messages.saved')]);
    }

    private function profile(): array
    {
        return app('currentInstitution')->fresh()->only(['id', 'name', 'slug', 'institution_type', 'address', 'phone', 'email', 'status']);
    }
}
