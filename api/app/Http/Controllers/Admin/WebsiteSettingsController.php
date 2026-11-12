<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Services\{DomainService, InstitutionSettings};
use App\Services\PublicSite\PublicSiteService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

// D202 PUB.2 (docs/modules/public-website.md "Admin UI"): the admin's own public site settings, `institutions.settings.public_site`.
// Every text is plain text (shown as text, never as HTML); links must start with https://; the hero image is JPG/PNG/WebP up to
// 2 MB. A private batch switching its site on also gets `leads` (the applications go there); switching off never removes it.
class WebsiteSettingsController extends Controller
{
    public function __construct(private PublicSiteService $site, private InstitutionSettings $settings) {}

    public function show()
    {
        return response()->json(['success' => true, 'data' => $this->view()]);
    }

    public function update(Request $request)
    {
        $https = ['nullable', 'string', 'max:255', 'regex:#^https://[^\s<>"]+$#i'];
        $v = $request->validate([
            'enabled' => 'sometimes|boolean', 'show_programs' => 'sometimes|boolean', 'show_notices' => 'sometimes|boolean',
            'admission_open' => 'sometimes|boolean', 'alert_sms' => 'sometimes|boolean',
            'headline' => 'nullable|string|max:150', 'tagline' => 'nullable|string|max:200', 'about' => 'nullable|string|max:1500',
            'admission_message' => 'nullable|string|max:300',
            'contact' => 'sometimes|array',
            'contact.phone' => ['nullable', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'], 'contact.email' => 'nullable|email|max:100',
            'contact.address' => 'nullable|string|max:300', 'contact.map_url' => $https, 'contact.facebook_url' => $https,
            'contact.whatsapp' => ['nullable', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'seo' => 'sometimes|array', 'seo.title' => 'nullable|string|max:70', 'seo.description' => 'nullable|string|max:160',
            'hero_image_path' => 'prohibited',
        ]);
        $i = app('currentInstitution');
        $old = $this->site->settings($i);
        $new = array_replace($old, array_map(fn ($x) => $x ?? '', array_intersect_key($v, $old)));
        foreach (['contact', 'seo'] as $k) if (isset($v[$k])) $new[$k] = array_replace($old[$k], array_map(fn ($x) => (string) ($x ?? ''), array_intersect_key($v[$k], $old[$k])));
        $this->settings->merge($i, ['public_site' => $new]);
        if (!$old['enabled'] && $new['enabled'] && $i->institution_type === 'private_batch') {
            $i->forceFill(['enabled_modules' => array_replace($i->enabled_modules ?? [], ['leads' => true])])->save();
        }
        PublicSiteService::forget($i->id);
        AuditLog::record('website.updated', $i, ['changed' => array_keys(array_diff_assoc(array_map('json_encode', $new), array_map('json_encode', $old)))]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->view()]);
    }

    /** POST /admin/settings/website/hero (multipart `hero`) */
    public function hero(Request $request)
    {
        $request->validate(['hero' => ['required', 'file', 'image', 'mimes:png,jpg,jpeg,webp', 'max:2048']]);
        $i = app('currentInstitution');
        $s = $this->site->settings($i);
        if ($s['hero_image_path']) Storage::disk('public')->delete($s['hero_image_path']);
        // docs/architecture/file-storage.md: a server UUID name, the extension from the sniffed type - never the client's
        $file = $request->file('hero');
        $path = $file->storeAs("institutions/{$i->id}/branding", 'hero-' . Str::uuid() . '.' . $file->extension(), 'public');
        $this->settings->merge($i, ['public_site' => array_replace($s, ['hero_image_path' => $path])]);
        PublicSiteService::forget($i->id);
        AuditLog::record('website.hero_uploaded', $i);
        return response()->json(['success' => true, 'message' => __('messages.hero_uploaded'), 'data' => ['hero_url' => $this->site->heroUrl($path)]]);
    }

    private function view(): array
    {
        $i = app('currentInstitution')->fresh();
        $s = $this->site->settings($i);
        unset($s['hero_image_path']);
        return $s + ['hero_url' => $this->site->heroUrl(($i->settings['public_site'] ?? [])['hero_image_path'] ?? null), 'site_url' => app(DomainService::class)->primaryUrl($i)];
    }
}
