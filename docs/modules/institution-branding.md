# Per-Institution Theme Management (Super Admin)

> **Revision 7 (consolidated):** পুরনো runtime/gating অংশ মুছে ফেলা হয়েছে (নিচে পয়েন্টার আছে)। **Revision 6 — এই ফাইলের অবস্থান:** এটি theme system-এর **Layer 1 (Brand: color, logo, favicon, mode)** — এখানকার `ThemeService`, controller, Super Admin UI ও audit log code সেভাবেই বানান। Layout, token ও preset (Layer 2–4) আছে `docs/THEMING.md`-এ। সেই ফাইল এখানকার চারটি অংশ **প্রতিস্থাপন** করে: (১) `ThemeService::getTheme()`-এর response shape, (২) `hooks/useTheme.js` → `theme/ThemeProvider.jsx`, (৩) `tailwind.config.js`, (৪) plan gating টেবিল (লোগো এখন সব plan-এ)। Cache key সর্বত্র `theme:{institution_id}` ও `bootstrap:{institution_id}`।

## Overview
Super Admin প্রতিটি স্কুলের জন্য আলাদা ব্র্যান্ডিং সেট করতে পারবেন — primary/secondary/accent color, logo, favicon, light/dark mode default। স্কুল তাদের নিজস্ব সাবডোমেইন বা কাস্টম ডোমেইনে লগইন করলে এই থিম স্বয়ংক্রিয়ভাবে প্রয়োগ হবে। Institution Admin নিজেও (Pro+ প্ল্যানে) সীমিতভাবে নিজের স্কুলের থিম বদলাতে পারবে।

**কে কী করতে পারবে:**

| Action | Super Admin | Institution Admin (Pro+) | Institution Admin (Basic) |
|--------|-------------|----------------------|----------------------|
| যেকোনো স্কুলের থিম দেখা | ✅ | — | — |
| যেকোনো স্কুলের থিম পরিবর্তন | ✅ | — | — |
| নিজের স্কুলের থিম পরিবর্তন | ✅ | ✅ | ❌ (upgrade prompt) |
| Theme change history দেখা | ✅ | ✅ (নিজের স্কুলের) | — |

---

## Database (already in schema.sql)
```sql
-- institutions টেবিলে (দেখুন docs/database/schema.sql)
primary_color      VARCHAR(7)  DEFAULT '#185FA5'
secondary_color    VARCHAR(7)  DEFAULT '#0F6E56'
accent_color       VARCHAR(7)  DEFAULT '#E67E22'
logo_path          VARCHAR(255) NULL
favicon_path       VARCHAR(255) NULL
theme_mode         ENUM('light','dark','auto') DEFAULT 'light'
theme_updated_by   BIGINT UNSIGNED NULL
theme_updated_at   TIMESTAMP NULL

-- institution_theme_logs — প্রতিটি পরিবর্তনের audit trail
```

---

## API Endpoints

```
GET   /super/institutions/{id}/theme        → নির্দিষ্ট স্কুলের বর্তমান থিম
PUT   /super/institutions/{id}/theme        → Super Admin থিম আপডেট করে (যেকোনো স্কুল)
POST  /super/institutions/{id}/theme/logo   → Logo আপলোড (multipart)
POST  /super/institutions/{id}/theme/favicon→ Favicon আপলোড
GET   /super/institutions/{id}/theme/history→ Theme change log (audit)
POST  /super/institutions/{id}/theme/reset  → Default theme-এ ফিরিয়ে দেওয়া

GET   /admin/theme                     → Institution Admin নিজের স্কুলের থিম দেখে
PUT   /admin/theme                     → Institution Admin নিজের থিম বদলায় (Pro+ only)

GET   /theme/public                    → Public, unauthenticated — Login পেজ লোড করার আগে থিম পাওয়ার জন্য
```

---

## Laravel — ThemeService.php

```php
<?php
namespace App\Services;

use App\Models\{Institution, InstitutionThemeLog};
use Illuminate\Support\Facades\{Storage, Cache};

class ThemeService
{
    /** One place that invalidates everything derived from the theme (R6: keys use the institution id; there is no custom_domain column any more) */
    private function flush(Institution $institution): void
    {
        Cache::forget("theme:{$institution->id}");
        Cache::forget("bootstrap:{$institution->id}");
    }

    private array $allowedFields = [
        'primary_color', 'secondary_color', 'accent_color', 'theme_mode',
    ];

    /** @deprecated Use getTheme() from docs/THEMING.md (adds layout, tokens, on_primary). Keep only for the audit-log diff below. */
    public function get(Institution $institution): array
    {
        return [
            'primary_color'   => $institution->primary_color,
            'secondary_color' => $institution->secondary_color,
            'accent_color'    => $institution->accent_color,
            'logo_url'        => $institution->logo_path ? Storage::disk('public')->url($institution->logo_path) : null,
            'favicon_url'     => $institution->favicon_path ? Storage::disk('public')->url($institution->favicon_path) : null,
            'theme_mode'      => $institution->theme_mode,
            'updated_at'      => $institution->theme_updated_at,
        ];
    }

    public function update(Institution $institution, array $data, int $updatedBy): Institution
    {
        $this->validateColors($data);

        $old = $institution->only($this->allowedFields);
        $institution->fill(array_intersect_key($data, array_flip($this->allowedFields)));
        $institution->theme_updated_by = $updatedBy;
        $institution->theme_updated_at = now();
        $institution->save();

        InstitutionThemeLog::create([
            'institution_id'   => $institution->id,
            'changed_by'  => $updatedBy,
            'old_values'  => $old,
            'new_values'  => $institution->only($this->allowedFields),
        ]);

        $this->flush($institution);

        return $institution->fresh();
    }

    public function uploadLogo(Institution $institution, \Illuminate\Http\UploadedFile $file, int $updatedBy): string
    {
        // Delete the old logo
        if ($institution->logo_path) {
            Storage::disk('public')->delete($institution->logo_path);
        }

        $path = $file->store("institutions/{$institution->id}/branding", 'public');
        $institution->update([
            'logo_path'         => $path,
            'theme_updated_by'  => $updatedBy,
            'theme_updated_at'  => now(),
        ]);
        $this->flush($institution);

        return Storage::disk('public')->url($path);
    }

    public function uploadFavicon(Institution $institution, \Illuminate\Http\UploadedFile $file, int $updatedBy): string
    {
        if ($institution->favicon_path) {
            Storage::disk('public')->delete($institution->favicon_path);
        }
        $path = $file->store("institutions/{$institution->id}/branding", 'public');
        $institution->update(['favicon_path' => $path, 'theme_updated_by' => $updatedBy, 'theme_updated_at' => now()]);
        $this->flush($institution);

        return Storage::disk('public')->url($path);
    }

    public function resetToDefault(Institution $institution, int $updatedBy): Institution
    {
        return $this->update($institution, [
            'primary_color'   => '#185FA5',
            'secondary_color' => '#0F6E56',
            'accent_color'    => '#E67E22',
            'theme_mode'      => 'light',
        ], $updatedBy);
    }

    /** Public (pre-auth) theme. The tenant is bound by TenantMiddleware from the request Host - NEVER from a client-supplied
     *  slug/domain parameter (docs/LOCKED-DECISIONS.md D8), and there is no custom_domain column to look up (institution_domains, R6).
     *  Central host (no tenant) -> platform default theme. */
    public function getPublicTheme(): array
    {
        if (!app()->bound('currentInstitution')) return $this->defaultTheme();
        return $this->getTheme(app('currentInstitution'));            // getTheme(): docs/THEMING.md (cached as theme:{id})
    }

    private function defaultTheme(): array
    {
        return [
            'primary_color' => '#185FA5', 'secondary_color' => '#0F6E56',
            'accent_color'  => '#E67E22', 'logo_url' => null,
            'favicon_url'   => null, 'theme_mode' => 'light',
        ];
    }

    private function validateColors(array $data): void
    {
        foreach (['primary_color', 'secondary_color', 'accent_color'] as $field) {
            if (isset($data[$field]) && !preg_match('/^#[0-9A-Fa-f]{6}$/', $data[$field])) {
                throw new \App\Exceptions\BusinessException(
                    "Invalid color format for {$field}. Use #RRGGBB.", 'invalid_color'
                );
            }
        }
    }
}
```

---

## Laravel — Controller

```php
// app/Http/Controllers/SuperAdmin/InstitutionThemeController.php
class InstitutionThemeController extends BaseController
{
    public function __construct(private ThemeService $themeService) {}

    public function show(int $institutionId): JsonResponse
    {
        $institution = Institution::findOrFail($institutionId)    // Institution is the tenant itself - no scope to remove;
        return $this->success($this->themeService->get($institution));
    }

    public function update(Request $request, int $institutionId): JsonResponse
    {
        $request->validate([
            'primary_color'   => 'nullable|regex:/^#[0-9A-Fa-f]{6}$/',
            'secondary_color' => 'nullable|regex:/^#[0-9A-Fa-f]{6}$/',
            'accent_color'    => 'nullable|regex:/^#[0-9A-Fa-f]{6}$/',
            'theme_mode'      => 'nullable|in:light,dark,auto',
        ]);

        $institution = Institution::findOrFail($institutionId)    // Institution is the tenant itself - no scope to remove;
        $updated = $this->themeService->update($institution, $request->all(), auth()->id());

        return $this->success($this->themeService->get($updated), 'Theme updated successfully');
    }

    public function uploadLogo(Request $request, int $institutionId): JsonResponse
    {
        $request->validate(['logo' => 'required|image|mimes:png,jpg,jpeg,svg|max:1024']);
        $institution = Institution::findOrFail($institutionId)    // Institution is the tenant itself - no scope to remove;
        $url = $this->themeService->uploadLogo($institution, $request->file('logo'), auth()->id());

        return $this->success(['logo_url' => $url], 'Logo uploaded');
    }

    public function uploadFavicon(Request $request, int $institutionId): JsonResponse
    {
        $request->validate(['favicon' => 'required|image|mimes:png,ico|max:256']);
        $institution = Institution::findOrFail($institutionId)    // Institution is the tenant itself - no scope to remove;
        $url = $this->themeService->uploadFavicon($institution, $request->file('favicon'), auth()->id());

        return $this->success(['favicon_url' => $url], 'Favicon uploaded');
    }

    public function history(int $institutionId): JsonResponse
    {
        $logs = InstitutionThemeLog::where('institution_id', $institutionId)
            ->with('changedBy:id,name,role')
            ->latest()
            ->take(20)
            ->get();

        return $this->success($logs);
    }

    public function reset(int $institutionId): JsonResponse
    {
        $institution = Institution::findOrFail($institutionId)    // Institution is the tenant itself - no scope to remove;
        $this->themeService->resetToDefault($institution, auth()->id());

        return $this->success(null, 'Theme reset to default');
    }
}

// app/Http/Controllers/Admin/ThemeController.php — for Institution Admin's own institution
class ThemeController extends BaseController
{
    public function __construct(private ThemeService $themeService) {}

    public function show(): JsonResponse
    {
        return $this->success($this->themeService->get(app('currentInstitution')));
    }

    public function update(Request $request): JsonResponse
    {
        $institution = app('currentInstitution');
        $plan   = $institution->subscriptionPlan;

        if (empty($plan?->features['custom_branding'])) {
            return $this->error(
                'Theme customization is available on Pro plan and above.',
                'feature_not_available', 403
            );
        }

        $request->validate([
            'primary_color'   => 'nullable|regex:/^#[0-9A-Fa-f]{6}$/',
            'secondary_color' => 'nullable|regex:/^#[0-9A-Fa-f]{6}$/',
            'accent_color'    => 'nullable|regex:/^#[0-9A-Fa-f]{6}$/',
            'theme_mode'      => 'nullable|in:light,dark,auto',
        ]);

        $updated = $this->themeService->update($institution, $request->all(), auth()->id());
        return $this->success($this->themeService->get($updated), 'Theme updated');
    }
}

// Public — unauthenticated, called from Login page before auth
// app/Http/Controllers/PublicThemeController.php
class PublicThemeController extends BaseController
{
    public function show(Request $request, ThemeService $themeService): JsonResponse
    {
        // Tenant comes from the Host via TenantMiddleware (tenant:optional) - no 'domain' parameter is read (docs/LOCKED-DECISIONS.md D8)
        return $this->success($themeService->getPublicTheme());
    }
}
```

### Routes
*(These are already merged into the main `routes/api.php` in `docs/templates/laravel-core-files.md` — shown here again only for this module's own context. Define them once, not twice.)*
```php
// Super Admin — any institution
Route::middleware('role:super_admin')->prefix('super/institutions/{institutionId}/theme')->group(function () {
    Route::get('/',           [InstitutionThemeController::class, 'show']);
    Route::put('/',            [InstitutionThemeController::class, 'update']);
    Route::post('/logo',       [InstitutionThemeController::class, 'uploadLogo']);
    Route::post('/favicon',    [InstitutionThemeController::class, 'uploadFavicon']);
    Route::get('/history',     [InstitutionThemeController::class, 'history']);
    Route::post('/reset',      [InstitutionThemeController::class, 'reset']);
});

// Institution Admin — own institution only (Pro+ gated inside controller)
Route::middleware('role:admin')->prefix('admin/theme')->group(function () {
    Route::get('/',  [Admin\ThemeController::class, 'show']);
    Route::put('/',  [Admin\ThemeController::class, 'update']);
});

// Public — no auth, used by Login page
Route::middleware('tenant')->get('/theme/public', [PublicThemeController::class, 'show']);
```

---

## React — Super Admin UI

### pages/super-admin/InstitutionTheme.jsx
```jsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/common/PageHeader'

export default function InstitutionTheme() {
  const { institutionId } = useParams()
  const { addToast, openConfirm } = useUiStore()
  const queryClient = useQueryClient()

  const { data: theme, isLoading } = useQuery({
    queryKey: ['institution-theme', institutionId],
    queryFn: () => api.get(`/super/institutions/${institutionId}/theme`).then(r => r.data.data),
  })

  const { data: history } = useQuery({
    queryKey: ['institution-theme-history', institutionId],
    queryFn: () => api.get(`/super/institutions/${institutionId}/theme/history`).then(r => r.data.data),
  })

  const [form, setForm] = useState(null)
  const current = form ?? theme

  const updateMutation = useMutation({
    mutationFn: (data) => api.put(`/super/institutions/${institutionId}/theme`, data),
    onSuccess: () => {
      addToast('Theme updated successfully', 'success')
      queryClient.invalidateQueries({ queryKey: ['institution-theme', institutionId] })
      queryClient.invalidateQueries({ queryKey: ['institution-theme-history', institutionId] })
      setForm(null)
    },
  })

  const logoMutation = useMutation({
    mutationFn: (file) => {
      const fd = new FormData()
      fd.append('logo', file)
      return api.post(`/super/institutions/${institutionId}/theme/logo`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      addToast('Logo uploaded', 'success')
      queryClient.invalidateQueries({ queryKey: ['institution-theme', institutionId] })
    },
  })

  const resetMutation = useMutation({
    mutationFn: () => api.post(`/super/institutions/${institutionId}/theme/reset`),
    onSuccess: () => {
      addToast('Theme reset to default', 'success')
      queryClient.invalidateQueries({ queryKey: ['institution-theme', institutionId] })
    },
  })

  if (isLoading || !current) return <div className="p-6 text-content-muted">Loading...</div>

  const colorFields = [
    { key: 'primary_color',   label: 'Primary Color',   hint: 'Sidebar, buttons, links' },
    { key: 'secondary_color', label: 'Secondary Color', hint: 'Headers, accents' },
    { key: 'accent_color',    label: 'Accent Color',    hint: 'Highlights, badges' },
  ]

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader
        title="Institution Theme"
        breadcrumbs={[
          { label: 'Institutions', path: '/super-admin/institutions' },
          { label: `Institution #${institutionId}` },
          { label: 'Theme' },
        ]}
        actions={
          <button
            onClick={() => openConfirm({
              title: 'Reset theme to default?',
              description: 'This will revert all colors, logo stays unchanged.',
              type: 'warning',
              onConfirm: () => resetMutation.mutate(),
            })}
            className="text-sm text-content-muted border border-line px-3 py-1.5 rounded-token hover:bg-surface-muted"
          >
            Reset to Default
          </button>
        }
      />

      {/* Live Preview */}
      <div className="rounded-token overflow-hidden border border-line">
        <div className="px-4 py-3 flex items-center justify-between"
             style={{ backgroundColor: current.primary_color }}>
          <div className="flex items-center gap-2">
            {current.logo_url && (
              <img src={current.logo_url} alt="logo" className="h-7 w-7 rounded object-contain bg-white/20 p-0.5" />
            )}
            <span className="text-white font-medium text-sm">Institution Dashboard Preview</span>
          </div>
          <span className="w-6 h-6 rounded-full" style={{ backgroundColor: current.accent_color }} />
        </div>
        <div className="p-density bg-surface flex gap-2">
          <button className="px-3 py-1.5 text-white text-xs font-medium"
                  style={{ backgroundColor: current.primary_color }}>Primary Button</button>
          <button className="px-3 py-1.5 text-white text-xs font-medium"
                  style={{ backgroundColor: current.secondary_color }}>Secondary</button>
          <span className="px-2 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: current.accent_color }}>Badge</span>
        </div>
      </div>

      {/* Color Pickers */}
      <div className="bg-surface border p-density space-y-4">
        <h3 className="font-medium text-content">Brand Colors</h3>
        {colorFields.map(({ key, label, hint }) => (
          <div key={key} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-content">{label}</p>
              <p className="text-xs text-content-muted">{hint}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={current[key]}
                onChange={e => setForm({ ...current, [key]: e.target.value })}
                className="w-10 h-10 border cursor-pointer"
              />
              <input
                type="text"
                value={current[key]}
                onChange={e => setForm({ ...current, [key]: e.target.value })}
                className="w-24 border px-2 py-1.5 text-xs font-mono"
              />
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between pt-2 border-t border-line">
          <p className="text-sm font-medium text-content">Theme Mode</p>
          <select
            value={current.theme_mode}
            onChange={e => setForm({ ...current, theme_mode: e.target.value })}
            className="border px-3 py-1.5 text-sm"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto (follows system)</option>
          </select>
        </div>

        {form && (
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => updateMutation.mutate(form)}
              disabled={updateMutation.isPending}
              className="bg-primary text-on-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
            <button onClick={() => setForm(null)}
              className="border border-line text-content-muted px-4 py-2 rounded-token text-sm">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Logo Upload */}
      <div className="bg-surface border p-density">
        <h3 className="font-medium text-content mb-3">School Logo</h3>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 border flex items-center justify-center
                          bg-surface-muted overflow-hidden">
            {current.logo_url
              ? <img src={current.logo_url} alt="logo" className="w-full h-full object-contain" />
              : <span className="text-content-muted text-xs">No logo</span>}
          </div>
          <label className="cursor-pointer text-sm hover:bg-line px-4 py-2 rounded-token
                             text-content font-medium">
            Upload New Logo
            <input type="file" accept="image/*" className="hidden"
              onChange={e => e.target.files[0] && logoMutation.mutate(e.target.files[0])} />
          </label>
        </div>
        <p className="text-xs text-content-muted mt-2">PNG, JPG or SVG. Max 1MB. Square aspect ratio recommended.</p>
      </div>

      {/* Change History */}
      {history?.length > 0 && (
        <div className="bg-surface border p-density">
          <h3 className="font-medium text-content mb-3">Change History</h3>
          <div className="space-y-2">
            {history.map(log => (
              <div key={log.id} className="text-xs text-content-muted flex justify-between border-b
                                            pb-2">
                <span>Changed by {log.changed_by?.name}</span>
                <span>{log.created_at}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

### Institutions List — Theme Shortcut
```jsx
// pages/super-admin/Institutions.jsx — add to row actions
<button
  onClick={() => navigate(`/super-admin/institutions/${institution.id}/theme`)}
  className="text-xs text-accent hover:underline flex items-center gap-1"
>
  🎨 Theme
</button>
```

---

## Runtime Theme Application, Login Branding, Plan Gating — moved (Revision 7)
এই তিনটি এখন শুধু `docs/THEMING.md`-এ (পুরনো `hooks/useTheme.js`, App.jsx-এর `useTheme()` call, `tailwind.config.js` bridge, হাতে-লেখা gradient লগইন পেজ ও ৩-plan gating টেবিল এখান থেকে মুছে ফেলা হয়েছে — সেগুলো নতুন token/layout নকশার সাথে সংঘর্ষ করত):
- রং, token, dark mode, favicon প্রয়োগ → `theme/ThemeProvider.jsx` (`GET /bootstrap` থেকে)
- Tailwind class → `tailwind.config.js` token (`bg-primary`, `bg-surface`, `border-line` …)
- লগইন পেজের চেহারা (লোগো, রং) → `pages/auth/login-templates/*` (`tokens.login_template`)
- plan অনুযায়ী কী বদলানো যায় → ওই ফাইলের "Subscription Plan Gating" (লোগো সব plan-এ; রং/token/layout/favicon `custom_branding`; "Powered by" সরানো `white_label`)

---

## Notes / Edge Cases

- **Cache invalidation**: থিম বদলালে `theme:{slug}` আর `theme:domain:{domain}` উভয় Redis key clear করা হয় — custom domain স্কুলের জন্য দুটো ক্যাশ কি থাকে।
- **Color contrast validation**: ভবিষ্যতে যোগ করা যায় — খুব হালকা রঙ (যেমন `#FFFFF0`) primary হিসেবে সিলেক্ট করলে warning দেখানো, যাতে টেক্সট readability নষ্ট না হয়।
- **Multi-branch institution**: একই parent institution-এর branch-গুলো আলাদা থিম রাখতে পারবে, অথবা Super Admin চাইলে "inherit from head office" টগল দিতে পারেন (future enhancement)।
- **Audit trail**: `institution_theme_logs`-এ old/new JSON রাখা হয় যাতে কোনো ভুল পরিবর্তন হলে Super Admin দেখে বুঝতে পারেন কে কখন কী বদলেছিলেন। Rollback বাটন যোগ করা যায় future-এ (log থেকে old_values re-apply)।
