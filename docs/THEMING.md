# Theme & Layout System (Revision 6)

> **Revision 8:** এই ফাইল L1–L3 (রঙ, স্টাইল-টোকেন, layout-শেল)। **কম্পোনেন্ট ও পাতার গঠন বদলানো (L4–L5, "UI Pack") আলাদা ফাইলে: `docs/UI-PACKS.md`।** কার্যকর theme object এখন `ui_pack`-ও বহন করে।

## Overview
প্রতিটি প্রতিষ্ঠান নিজের ইচ্ছামতো চেহারা পাবে — শুধু রঙ ও লোগো নয়, **আলাদা layout ও আলাদা UI style**-ও। এটি চারটি স্তরে কাজ করে:

| Layer | What It Controls | Stored In |
|---|---|---|
| 1. Brand | primary/secondary/accent color, logo, favicon, light/dark | `institutions.primary_color …` (আগে থেকেই আছে) |
| 2. Tokens | font, corner radius, density, card style, sidebar style, login template | `institutions.theme_tokens` JSON |
| 3. Layout | পুরো app shell-এর গঠন: sidebar / top nav / mobile bottom bar | `institutions.layout_key` |
| 4. Preset | উপরের তিনটির একটি তৈরি-করা প্যাকেজ, এক ক্লিকে প্রয়োগ | `theme_presets` table + `institutions.theme_preset_id` |

**এই ফাইল ও `docs/modules/institution-branding.md`-এর সম্পর্ক:** পুরনো ফাইলটি Layer 1 (Brand)-এর সম্পূর্ণ code দেয় — `ThemeService`, `InstitutionThemeController`, Super Admin `InstitutionTheme.jsx`, audit log — সেগুলো সেভাবেই বানান। এই ফাইল Layer 2–4 যোগ করে এবং তিনটি জিনিস **প্রতিস্থাপন** করে (নিচে পূর্ণ code আছে): `ThemeService::getTheme()`-এর response, `hooks/useTheme.js`, এবং `tailwind.config.js`। এছাড়া `docs/BUILD-SEQUENCE.md`-এর পুরনো "৬টি role layout" ধারণা বাদ — তার বদলে একটি `AppShell` + layout registry।

---

## Design Rules (Why This Stays Maintainable)

1. **Page কখনো layout জানে না।** প্রতিটি page শুধু নিজের content render করে (`<PageHeader/>` + body)। Sidebar, top bar, bottom bar — সব layout component-এর কাজ।
2. **Page ও component-এ কোনো hex color, কোনো নির্দিষ্ট `rounded-lg`/font নাম নেই** — শুধু token class (`bg-primary`, `rounded-token`, `shadow-card`, `p-density`)। CI-তে চেক: `src/pages` ও `src/components`-এ `#[0-9a-fA-F]{3,6}` পাওয়া গেলে build fail।
3. **Menu-র একটিই উৎস:** `src/nav/menu.js`। সব layout একই menu data পায়; কোনো layout নিজের menu লেখে না।
4. **নতুন layout যোগ = একটি নতুন ফাইল + registry-তে এক লাইন।** কোনো page বদলাতে হয় না। এটিই এই design-এর পরীক্ষা।
5. **প্রতিষ্ঠান arbitrary CSS/HTML দিতে পারে না** (নিরাপত্তা) — শুধু নির্ধারিত token মান বাছাই করে।

---

## Database
Table ও column: `docs/database/schema.sql` (Revision 6 section) — `theme_presets`, এবং `institutions.theme_preset_id`, `layout_key`, `theme_tokens`।

### Token Schema (`theme_presets.tokens` and `institutions.theme_tokens`)
সব key ঐচ্ছিক; অনুমোদিত মান নিচে নির্দিষ্ট — এর বাইরের মান validation-এ বাতিল।

| Key | Allowed Values | Default |
|---|---|---|
| `font_family` | `hind-siliguri`, `noto-sans-bengali`, `baloo-da-2`, `anek-bangla`, `inter` | `hind-siliguri` |
| `radius` | `none`, `sm`, `md`, `lg`, `xl` | `md` |
| `density` | `compact`, `comfortable`, `spacious` | `comfortable` |
| `card_style` | `flat`, `bordered`, `shadow` | `bordered` |
| `sidebar_style` | `light`, `dark`, `brand` | `light` |
| `table_style` | `plain`, `striped` | `plain` |
| `login_template` | `centered`, `split`, `cover` | `centered` |
| `dashboard_variant` | `cards`, `compact` | `cards` |

Validation rule (backend, `ThemeTokensRule`): প্রতিটি key উপরের list-এ আছে এবং মান অনুমোদিত set-এর ভেতরে।

### Resolution Order
```
effective.brand   = institution columns            (always set; defaults come from the preset when a preset is applied)
effective.layout  = institution.layout_key  ?? preset.layout_key ?? type default_layout ?? 'sidebar-classic'
effective.tokens  = DEFAULT_TOKENS  ←  preset.tokens  ←  institution.theme_tokens   (later wins, per key)
```
Preset প্রয়োগ করলে (`applyPreset`) preset-এর color গুলো `institutions.primary_color …`-এ কপি হয়, `theme_preset_id` সেট হয়, এবং `layout_key` ও `theme_tokens` `NULL` করা হয় (যাতে preset-এর মানই কার্যকর হয়)। এরপর প্রতিষ্ঠান যা বদলায় তা override হিসেবে জমে।

---

## Seeded Presets — ThemePresetSeeder
| key | name | layout_key | ui_pack | primary / secondary / accent | tokens (non-default) | allowed_types | is_premium |
|---|---|---|---|---|---|---|---|
| `classic-blue` | Classic Blue | `sidebar-classic` | `classic` | `#185FA5` / `#0F6E56` / `#E67E22` | — | all | 0 |
| `modern-mint` | Modern Mint | `sidebar-mini` | `fresh` | `#0F766E` / `#134E4A` / `#F59E0B` | radius `lg`, card_style `shadow`, font `anek-bangla` | all | 0 |
| `campus-top` | Campus Top | `topnav` | `classic` | `#1E3A8A` / `#0F172A` / `#DC2626` | radius `sm`, table_style `striped`, login_template `split` | all | 0 |
| `tutor-lite` | Tutor Lite | `mobile-compact` | `mobile` | `#7C3AED` / `#4C1D95` / `#F97316` | radius `xl`, density `spacious`, dashboard_variant `compact` | `["private_batch","coaching"]` | 0 |
| `royal-dark` | Royal Dark | `sidebar-classic` | `classic` | `#6D28D9` / `#1E1B4B` / `#FBBF24` | sidebar_style `dark`, theme_mode `dark`, card_style `flat` | all | 1 |
| `sunrise` | Sunrise | `topnav` | `fresh` | `#C2410C` / `#7C2D12` / `#0D9488` | radius `lg`, font `baloo-da-2`, login_template `cover` | all | 1 |

Super Admin UI থেকে নতুন preset তৈরি/সম্পাদনা করতে পারে (কোনো code change ছাড়া), কারণ preset শুধু বিদ্যমান layout ও token-এর সমন্বয়। নতুন **layout** যোগ করতে code লাগে (নিচে)।

---

## API Endpoints
```
# Public (pre-auth, tenant from Host)
GET   /theme/public                         → effective theme object (same as bootstrap.theme)

# Institution Admin
GET   /admin/theme                          → effective theme + raw overrides + available presets + available_packs[{key,label,layouts}]
PUT   /admin/theme                          → brand colors, theme_mode            (plan: custom_branding)
PUT   /admin/theme/tokens                   → { tokens: {...} }                   (plan: custom_branding)
PUT   /admin/theme/layout                   → { layout_key }                      (plan: custom_branding)
PUT   /admin/theme/pack                     → { ui_pack }                         (plan: custom_branding; layout-এর সাথে সঙ্গত হতে হবে - docs/UI-PACKS.md)
POST  /admin/theme/preset                   → { preset_key }   free presets: every plan; premium: custom_branding
POST  /admin/theme/logo | /favicon          → multipart                           (plan: custom_branding)

# Super Admin (any institution, regardless of plan)
GET|PUT  /super/institutions/{id}/theme            (existing — now also accepts layout_key, ui_pack, tokens, preset_key)
POST     /super/institutions/{id}/theme/logo | /favicon | /reset     (existing)
GET      /super/institutions/{id}/theme/history                       (existing)
GET|POST /super/theme-presets
PUT|DELETE /super/theme-presets/{id}        → DELETE refused (422) while any institution uses it
```
প্রতিটি পরিবর্তন `institution_theme_logs`-এ old/new JSON সহ লেখা হয় (বিদ্যমান audit) এবং cache key `bootstrap:{id}` ও `theme:{id}` মুছে যায়।

### Effective Theme Object (Response Shape — Fixed Contract)
```json
{
  "preset_key": "modern-mint",
  "layout_key": "sidebar-mini",
  "ui_pack": "fresh",
  "primary_color": "#0F766E",
  "secondary_color": "#134E4A",
  "accent_color": "#F59E0B",
  "on_primary": "#FFFFFF",
  "theme_mode": "light",
  "logo_url": "https://…/logo.png",
  "favicon_url": null,
  "tokens": {
    "font_family": "anek-bangla", "radius": "lg", "density": "comfortable",
    "card_style": "shadow", "sidebar_style": "light", "table_style": "plain",
    "login_template": "centered", "dashboard_variant": "cards"
  },
  "white_label": false,
  "updated_at": "2026-10-03T08:00:00Z"
}
```
`ui_pack` সবসময় একটি পরিচিত key (অজানা হলে backend `classic`; frontend-ও `PACKS[key] ?? classic`)। `tokens`-এ সবসময় **আটটি key-ই** থাকে (default দিয়ে পূরণ করা) — frontend কখনো fallback হিসাব করে না। `on_primary` backend হিসাব করে: primary color-এর relative luminance `> 0.5` হলে `#111827`, নয়তো `#FFFFFF`।

---

## Laravel — ThemeService Additions
`docs/modules/institution-branding.md`-এর `ThemeService`-এ নিচের method গুলো যোগ/প্রতিস্থাপন করুন।

```php
public const DEFAULT_TOKENS = [
    'font_family' => 'hind-siliguri', 'radius' => 'md', 'density' => 'comfortable',
    'card_style' => 'bordered', 'sidebar_style' => 'light', 'table_style' => 'plain',
    'login_template' => 'centered', 'dashboard_variant' => 'cards',
];

public const LAYOUTS = ['sidebar-classic', 'sidebar-mini', 'topnav', 'mobile-compact'];

/** R8: the pack key and its allowed layouts come from config/ui_packs.php (docs/UI-PACKS.md section 7) */
public function packFor(Institution $i, ?ThemePreset $preset): string
{
    $pack = $i->ui_pack ?? $preset?->ui_pack ?? 'classic';
    return array_key_exists($pack, config('ui_packs')) ? $pack : 'classic';
}

/** Called by applyPreset(), updateLayout() and updatePack(): the EFFECTIVE (layout, pack) pair must be allowed */
public function assertCompatible(string $layout, string $pack): void
{
    abort_unless(in_array($layout, config("ui_packs.{$pack}.layouts", []), true), 422, 'এই চেহারা ও layout একসাথে চলে না');
}

/** REPLACES the old getTheme(): returns the fixed contract above */
public function getTheme(Institution $i): array
{
    return Cache::remember("theme:{$i->id}", 3600, function () use ($i) {
        $preset = $i->theme_preset_id ? ThemePreset::find($i->theme_preset_id) : null;
        $typeLayout = config("institution_types.{$i->institution_type}.default_layout");

        $layout = $i->layout_key ?? $preset?->layout_key ?? $typeLayout ?? 'sidebar-classic';
        if (!in_array($layout, self::LAYOUTS, true)) $layout = 'sidebar-classic';

        return [
            'preset_key'      => $preset?->key,
            'layout_key'      => $layout,
            'ui_pack'         => $this->packFor($i, $preset),
            'primary_color'   => $i->primary_color,
            'secondary_color' => $i->secondary_color,
            'accent_color'    => $i->accent_color,
            'on_primary'      => $this->onColor($i->primary_color),
            'theme_mode'      => $i->theme_mode,
            'logo_url'        => $i->logo_path ? Storage::disk('public')->url($i->logo_path) : null,
            'favicon_url'     => $i->favicon_path ? Storage::disk('public')->url($i->favicon_path) : null,
            'tokens'          => array_merge(self::DEFAULT_TOKENS, $preset?->tokens ?? [], $i->theme_tokens ?? []),
            'white_label'     => (bool) ($i->plan?->features['white_label'] ?? false),
            'updated_at'      => $i->theme_updated_at,
        ];
    });
}

public function applyPreset(Institution $i, ThemePreset $preset, int $userId): array
{
    $allowed = $preset->allowed_types;
    abort_if($allowed && !in_array($i->institution_type, $allowed, true), 422, 'এই থিম এই ধরনের প্রতিষ্ঠানের জন্য নয়');

    $this->assertCompatible($preset->layout_key, $preset->ui_pack);          // a seeded preset must always be a valid pair
    $old = $this->getTheme($i);
    $i->update([
        'theme_preset_id' => $preset->id,
        'primary_color'   => $preset->primary_color,
        'secondary_color' => $preset->secondary_color,
        'accent_color'    => $preset->accent_color,
        'theme_mode'      => $preset->theme_mode,
        'layout_key'      => null,
        'ui_pack'         => null,
        'theme_tokens'    => null,
        'theme_updated_by'=> $userId,
        'theme_updated_at'=> now(),
    ]);
    return $this->logAndFlush($i, $old, $userId);   // writes institution_theme_logs, clears theme:* and bootstrap:* cache
}

private function onColor(string $hex): string
{
    [$r, $g, $b] = array_map(fn ($c) => hexdec($c) / 255, str_split(ltrim($hex, '#'), 2));
    $lin = fn ($c) => $c <= 0.03928 ? $c / 12.92 : (($c + 0.055) / 1.055) ** 2.4;
    $l = 0.2126 * $lin($r) + 0.7152 * $lin($g) + 0.0722 * $lin($b);
    return $l > 0.5 ? '#111827' : '#FFFFFF';
}
```
`updateTokens()`, `updateLayout()` ও `updatePack()` একই প্যাটার্নে: validate (`ThemeTokensRule` / `in:LAYOUTS` / `Rule::in(array_keys(config('ui_packs')))`) এবং layout ও pack বদলালে `assertCompatible(effectiveLayout, effectivePack)` → update → `logAndFlush()`। নতুন প্রতিষ্ঠান signup-এ `applyPreset()` চলে type-এর `default_preset` দিয়ে।

---

## React — Architecture

```
src/
├── theme/
│   ├── ThemeProvider.jsx        ← applies CSS variables + data-attributes on <html>
│   ├── tokens.css               ← maps data-attributes to CSS variables
│   └── fonts.js                 ← lazy-loads the selected Bengali font
├── layouts/
│   ├── registry.js              ← layout_key → lazy component
│   ├── AppShell.jsx             ← picks the layout, builds nav, renders <Outlet/>
│   ├── SidebarClassicLayout.jsx
│   ├── SidebarMiniLayout.jsx
│   ├── TopNavLayout.jsx
│   ├── MobileCompactLayout.jsx
│   └── parts/                   ← shared: BrandLogo, UserMenu, NotificationBell, NavItem, PoweredBy
├── nav/
│   └── menu.js                  ← the ONLY menu definition (per role)
└── pages/auth/login-templates/  ← CenteredLogin, SplitLogin, CoverLogin (same form component inside)
```

### theme/ThemeProvider.jsx — Full Code (REPLACES hooks/useTheme.js)
```jsx
import { useEffect } from 'react'
import { useInstitutionStore } from '../store/institutionStore'
import { loadFont } from './fonts'

export default function ThemeProvider({ children }) {
  const theme = useInstitutionStore(s => s.theme)        // filled from GET /bootstrap

  useEffect(() => {
    if (!theme) return
    const root = document.documentElement
    const t = theme.tokens

    // Layer 1 — brand
    root.style.setProperty('--color-primary', theme.primary_color)
    root.style.setProperty('--color-secondary', theme.secondary_color)
    root.style.setProperty('--color-accent', theme.accent_color)
    root.style.setProperty('--color-on-primary', theme.on_primary)

    // Layer 2 — tokens (tokens.css turns these attributes into CSS variables)
    root.dataset.radius  = t.radius
    root.dataset.density = t.density
    root.dataset.card    = t.card_style
    root.dataset.sidebar = t.sidebar_style
    root.dataset.table   = t.table_style
    root.dataset.font    = t.font_family
    loadFont(t.font_family)                  // Arabic fonts are loaded by I18nProvider when the locale is 'ar' (docs/I18N.md section 4.4)

    // Light / dark — a user's own choice (uiStore) wins over the institution default
    const userMode = localStorage.getItem('color-mode')            // 'light' | 'dark' | null
    const mode = userMode ?? theme.theme_mode
    const dark = mode === 'dark' || (mode === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
    root.classList.toggle('dark', dark)

    // Favicon + browser theme color
    if (theme.favicon_url) {
      let link = document.querySelector("link[rel~='icon']")
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
      link.href = theme.favicon_url
    }
    document.querySelector("meta[name='theme-color']")?.setAttribute('content', theme.primary_color)
  }, [theme])

  return children
}
```
`App.jsx`: `<ThemeProvider><RouterProvider router={router} /></ThemeProvider>`। `GET /bootstrap` শেষ না হওয়া পর্যন্ত একটি নিরপেক্ষ full-screen loader দেখান — default নীল theme এক মুহূর্তের জন্যও ঝলকানো যাবে না। পরের visit-এ ঝলকানি এড়াতে সর্বশেষ theme `localStorage['theme-cache:'+hostname]`-এ রেখে প্রথমে সেটি প্রয়োগ করুন, তারপর network response দিয়ে হালনাগাদ।

### theme/tokens.css — Full Code
```css
:root {
  --color-primary: #185FA5; --color-secondary: #0F6E56; --color-accent: #E67E22; --color-on-primary: #FFFFFF;
  --radius: 0.5rem; --space: 1rem; --row-h: 2.75rem; --font-body: 'Hind Siliguri', system-ui, sans-serif;
  --card-border: 1px solid rgb(229 231 235); --card-shadow: none;
  --surface: #FFFFFF; --surface-muted: #F8FAFC; --text: #111827; --text-muted: #6B7280; --line: #E5E7EB;
}
.dark { --surface: #0F172A; --surface-muted: #1E293B; --text: #F1F5F9; --text-muted: #94A3B8; --line: #334155; --card-border: 1px solid rgb(51 65 85); }

/* soft tints of the brand colours (selected rows, hover, badges) - computed, so no per-theme work */
:root { --color-primary-soft: color-mix(in srgb, var(--color-primary) 12%, var(--surface));
        --color-secondary-soft: color-mix(in srgb, var(--color-secondary) 12%, var(--surface)); }
.dark { --color-primary-soft: color-mix(in srgb, var(--color-primary) 22%, var(--surface)); }

/* Brand colour AS TEXT/LINK/ICON. On white it is the brand colour itself. On the dark surface the raw brand colour is unreadable
   (measured: Classic Blue 2.74:1, Modern Mint 3.26:1, Tutor Lite 3.13:1 on #0F172A - below the 4.5:1 text minimum), so in dark mode it is
   lightened by mixing 40% white: 6.41 / 6.99 / 6.57 : 1 on #0F172A and >= 5.26 on #1E293B for the three themes. Use `text-primary-fg`
   for any brand-coloured text; `text-primary` does not exist. Backgrounds keep using `bg-primary` + `text-on-primary`. */
:root  { --color-primary-fg: var(--color-primary); }
.dark  { --color-primary-fg: color-mix(in srgb, var(--color-primary) 60%, white); }

[data-radius='none'] { --radius: 0; }       [data-radius='sm'] { --radius: 0.25rem; }
[data-radius='md']   { --radius: 0.5rem; }  [data-radius='lg'] { --radius: 0.875rem; }
[data-radius='xl']   { --radius: 1.25rem; }

[data-density='compact']     { --space: 0.625rem; --row-h: 2.25rem; }
[data-density='comfortable'] { --space: 1rem;     --row-h: 2.75rem; }
[data-density='spacious']    { --space: 1.375rem; --row-h: 3.25rem; }

[data-card='flat']     { --card-border: none; --card-shadow: none; }
[data-card='bordered'] { --card-shadow: none; }
[data-card='shadow']   { --card-border: none; --card-shadow: 0 1px 3px rgb(0 0 0 / .08), 0 8px 24px rgb(0 0 0 / .06); }

/* `card_style=shadow` removes the border and relies on a shadow. A shadow is invisible on the dark surface, in forced-colors mode
   and on paper - so those three cases fall back to a hairline border (measured need: themes/theme-02/TOKENS.md section 4). */
.dark[data-card='shadow']                { --card-border: 1px solid var(--line); --card-shadow: none; }
@media (forced-colors: active)           { [data-card='shadow'] { --card-border: 1px solid CanvasText; } }
@media print                             { [data-card='shadow'] { --card-border: 1px solid #ccc; --card-shadow: none; } }

/* Revision 9: the institution's chosen font is --font-body-chosen. --font-body is what the page uses: it equals the chosen font, EXCEPT in Arabic where
   an Arabic-capable font must come first (the Bangla/Latin fonts have no Arabic glyphs). docs/I18N.md section 4.4 */
[data-font='hind-siliguri']     { --font-body-chosen: 'Hind Siliguri', system-ui, sans-serif; }
[data-font='noto-sans-bengali'] { --font-body-chosen: 'Noto Sans Bengali', system-ui, sans-serif; }
[data-font='baloo-da-2']        { --font-body-chosen: 'Baloo Da 2', system-ui, sans-serif; }
[data-font='anek-bangla']       { --font-body-chosen: 'Anek Bangla', system-ui, sans-serif; }
[data-font='inter']             { --font-body-chosen: 'Inter', 'Hind Siliguri', system-ui, sans-serif; }
:root                           { --font-ar: 'Noto Sans Arabic', 'Noto Naskh Arabic'; --font-body: var(--font-body-chosen); }
[data-locale='ar']              { --font-body: var(--font-ar), var(--font-body-chosen); }
[data-locale='ar'] body         { font-size: 1.0625rem; line-height: 1.8; }     /* proposal - verify in the spike */

/* Sidebar surface used by the two sidebar layouts */
[data-sidebar='light'] { --sidebar-bg: var(--surface); --sidebar-text: var(--text); }
[data-sidebar='dark']  { --sidebar-bg: #0F172A; --sidebar-text: #E2E8F0; }
[data-sidebar='brand'] { --sidebar-bg: var(--color-primary); --sidebar-text: var(--color-on-primary); }

body { font-family: var(--font-body); background: var(--surface-muted); color: var(--text); }
[data-table='striped'] tbody tr:nth-child(even) { background: var(--surface-muted); }
```

### tailwind.config.js — Full Code (REPLACES the old bridge)
```javascript
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)', secondary: 'var(--color-secondary)', accent: 'var(--color-accent)',
        'on-primary': 'var(--color-on-primary)',
        surface: 'var(--surface)', 'surface-muted': 'var(--surface-muted)',
        line: 'var(--line)',                                   // borders, dividers, progress-bar tracks
        'primary-soft': 'var(--color-primary-soft)', 'secondary-soft': 'var(--color-secondary-soft)',
        'primary-fg': 'var(--color-primary-fg)',            // brand-coloured TEXT / links / icons / focus ring (dark-mode safe)
        content: 'var(--text)', 'content-muted': 'var(--text-muted)',
        sidebar: 'var(--sidebar-bg)', 'on-sidebar': 'var(--sidebar-text)',
      },
      borderColor: { DEFAULT: 'var(--line)' },              // a bare `border` / `border-b` is themed too (do not rely on Tailwind's gray default)
      borderRadius: { token: 'var(--radius)' },
      spacing: { density: 'var(--space)', row: 'var(--row-h)' },
      boxShadow: { card: 'var(--card-shadow)' },
      fontFamily: { body: 'var(--font-body)' },
    },
  },
}
```
Shared component-এ ব্যবহার (উদাহরণ — `Card`): `className="bg-surface text-content rounded-token shadow-card p-density [border:var(--card-border)]"`। `docs/design/component-library.md`-এর সব component এই token class দিয়ে লিখুন; `bg-white`, `text-gray-800`, `rounded-lg`, `bg-blue-600` ধরনের class সেখানে ব্যবহার করা যাবে না। `docs/templates/react-page-examples.md`-এর উদাহরণ page গুলোতে এ ধরনের class থাকলে বানানোর সময় নিচের টেবিল অনুযায়ী বদলে নিন:

| In old examples | Write instead |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-gray-50`, `bg-gray-100` | `bg-surface-muted` |
| `border-gray-*`, `divide-gray-*`, `bg-gray-200` (track) | `border-line`, `divide-line`, `bg-line` |
| `bg-blue-50`, `hover:bg-blue-50` | `bg-primary-soft`, `hover:bg-primary-soft` |
| `text-blue-600`, `text-blue-700` (links, active labels) | `text-primary-fg` (**not** `text-primary`) |
| `border-blue-500` (selected), `focus:ring-blue-500` | `border-primary`, `focus:ring-primary-fg` |
| `hover:bg-blue-700` | `hover:opacity-90` |
| `text-gray-800`, `text-gray-900` | `text-content` |
| `text-gray-500`, `text-gray-600` | `text-content-muted` |
| `bg-blue-600`, `bg-[#185FA5]` | `bg-primary text-on-primary` |
| `rounded-lg`, `rounded-xl`, `rounded-md` | `rounded-token` |
| `shadow`, `shadow-sm`, `shadow-md` (on cards) | `shadow-card` |
| `p-4`, `p-6` (card/page padding) | `p-density` |
| inline `style={{ background: '#…' }}` | token class |

Status color (success সবুজ, danger লাল, warning হলুদ) Tailwind-এর নিজস্ব `green/red/amber` থাকবে — এগুলো brand-এর অংশ নয়।

### layouts/registry.js — Full Code
```javascript
import { lazy } from 'react'

export const LAYOUTS = {
  'sidebar-classic': lazy(() => import('./SidebarClassicLayout')),
  'sidebar-mini':    lazy(() => import('./SidebarMiniLayout')),
  'topnav':          lazy(() => import('./TopNavLayout')),
  'mobile-compact':  lazy(() => import('./MobileCompactLayout')),
}
export const DEFAULT_LAYOUT = 'sidebar-classic'
```

### layouts/AppShell.jsx — Full Code
```jsx
import { Suspense, useMemo } from 'react'
import { Outlet } from 'react-router-dom'
import { LAYOUTS, DEFAULT_LAYOUT } from './registry'
import { buildNav } from '../nav/menu'
import { useAuthStore } from '../store/authStore'
import { useInstitutionStore } from '../store/institutionStore'
import { useTerms } from '../hooks/useTerms'
import Loader from '../components/Loader'

export default function AppShell() {
  const user        = useAuthStore(s => s.user)
  const institution = useInstitutionStore(s => s.institution)
  const theme       = useInstitutionStore(s => s.theme)
  const modules     = useInstitutionStore(s => s.modules)
  const t           = useTerms()

  // Super Admin always uses sidebar-classic with the platform theme
  const key    = user.role === 'super_admin' ? DEFAULT_LAYOUT : theme.layout_key
  const Layout = LAYOUTS[key] ?? LAYOUTS[DEFAULT_LAYOUT]
  const nav    = useMemo(() => buildNav(user.role, modules, t), [user.role, modules, t])

  return (
    <Suspense fallback={<Loader fullScreen />}>
      <Layout nav={nav} user={user} institution={institution} theme={theme}>
        <Suspense fallback={<Loader />}><Outlet /></Suspense>
      </Layout>
    </Suspense>
  )
}
```
Router-এ প্রতিটি role-এর route group-এর parent element এই একই `<AppShell />` (আগের `AdminLayout`, `TeacherLayout` … বাদ)।

### nav/menu.js — Structure
```javascript
import { LayoutDashboard, Users, Layers, CalendarCheck, Wallet, FileText, MessageSquare, Settings } from 'lucide-react'

// One list per role. `module` hides the item when the module is disabled.
// `label` is either a fixed bn string or a function of the terminology hook.
// `primary: true` = shown in the bottom bar of mobile-compact (max 4 per role; the rest go under "More").
const MENU = {
  admin: [
    { key: 'dashboard', icon: LayoutDashboard, path: '/admin/dashboard', label: 'ড্যাশবোর্ড', primary: true },
    { key: 'students',  icon: Users,   path: '/admin/students', label: 'Student', module: 'students', primary: true },
    { key: 'academic',  icon: Layers,  label: 'একাডেমিক', children: [
        { key: 'programs', path: '/admin/academic/programs', label: t => t('programs'), hideWhen: s => s.use_programs === false },
        { key: 'batches',  path: '/admin/batches',           label: t => t('batches'), module: 'enrollments', primary: true },
        { key: 'routine',  path: '/admin/academic/routine',  label: 'রুটিন', module: 'routine' },
    ]},
    { key: 'attendance', icon: CalendarCheck, path: '/admin/attendance', label: 'উপস্থিতি', module: 'attendance' },
    { key: 'fees',       icon: Wallet,        path: '/admin/fees',       label: 'ফি',        module: 'fees', primary: true },
    // … the COMPLETE menu data for every role is in docs/AUTHORIZATION.md "Role-Based Navigation — Authoritative Menu Data" - copy it verbatim into this file.
  ],
  teacher: [/* … */], student: [/* … */], parent: [/* … */], accountant: [/* … */], super_admin: [/* … */],
}

export function buildNav(role, modules, t, settings = {}) {
  const ok = i => (!i.module || modules.includes(i.module)) && !(i.hideWhen && i.hideWhen(settings))
  const map = i => ({ ...i, label: typeof i.label === 'function' ? i.label(t) : i.label,
                      children: i.children?.filter(ok).map(map) })
  return (MENU[role] ?? []).filter(ok).map(map).filter(i => !i.children || i.children.length)
}
```

### Layout Contract (Every Layout Must Satisfy This)
> **Revision 9 (RTL):** প্রতিটি layout (ক) *logical* class ছাড়া কিছু ব্যবহার করে না (`ms-/me-/ps-/pe-/start-/end-`), (খ) `dir=rtl`-এ আয়না হয় (sidebar ডানে, flyout বামে, tab bar-এর ক্রম উল্টো), (গ) দিক-সূচক আইকন `DirIcon` দিয়ে — `docs/I18N.md` §৪.২।
Props: `{ nav, user, institution, theme, children }`। প্রতিটি layout-কে অবশ্যই render করতে হবে:

| Required element | Shared part to use |
|---|---|
| প্রতিষ্ঠানের লোগো + নাম | `parts/BrandLogo` (লোগো না থাকলে নামের আদ্যক্ষর, `bg-primary`) |
| `nav`-এর সব item (group সহ), active state সহ | `parts/NavItem` |
| Notification bell | `components/NotificationBell` |
| User menu: profile, password change, light/dark toggle, logout | `parts/UserMenu` |
| **Language switcher** — শুধু চালু ভাষা (bn/en/ar), নিজ লিপিতে; লগইন/পাবলিক পাতাতেও | `parts/LanguageSwitcher` (`docs/I18N.md` §১) |
| Subscription expiry / trial banner | `parts/PlanBanner` |
| `children` (page content) একটি scroll container-এ | — |
| "Powered by …" footer, `theme.white_label === false` হলে | `parts/PoweredBy` |

| layout_key | Desktop (≥1024px) | Tablet/Mobile (<1024px) | Best for |
|---|---|---|---|
| `sidebar-classic` | বামে 260px sidebar (group শিরোনাম সহ) + উপরে সরু top bar | Sidebar → drawer (hamburger) | school, college |
| `sidebar-mini` | বামে 72px icon rail; hover/click-এ flyout submenu; বড় content area | Drawer | coaching, data-heavy admin |
| `topnav` | উপরে horizontal menu + dropdown; content `max-w-7xl` কেন্দ্রে | Hamburger → full-screen menu | college, ছোট menu-র role |
| `mobile-compact` | Content `max-w-md` কেন্দ্রে, নিচে tab bar (app-এর মতো) | নিচে fixed tab bar: `primary` item ৪টি + "More" | private_batch, student/parent |

সব layout-এ sidebar/top bar-এর রঙ `bg-sidebar text-on-sidebar` (অর্থাৎ `sidebar_style` token মানে)। Print-এ (`@media print`) সব layout chrome লুকানো — শুধু `children`।

### Login Templates
`tokens.login_template` অনুযায়ী `pages/auth/Login.jsx` তিনটির একটি wrapper বেছে নেয়; ভেতরের `<LoginForm/>` একই (`docs/templates/react-page-examples.md`-এর form logic)।
- `centered` — মাঝখানে card, পেছনে `bg-surface-muted`
- `split` — বামে `bg-primary` প্যানেল (লোগো, নাম, ঠিকানা), ডানে form
- `cover` — পুরো পর্দায় primary→secondary gradient, উপরে ভাসমান form card

---

## Admin UI — Settings → Appearance
`/admin/settings/appearance` (Institution Admin) এবং `/super-admin/institutions/:id/theme` (Super Admin) একই `<ThemeEditor/>` component ব্যবহার করে:

1. **Presets** — card grid (preview image, নাম, layout badge); premium হলে তালা icon + upgrade prompt; "Apply" → confirm → `POST …/preset`।
2. **Layout** — চারটি layout-এর wireframe thumbnail থেকে বাছাই।
2b. **UI Pack** (চেহারার গঠন) — `available_packs` থেকে বাছাই, প্রতিটির কার্ড: নাম, কী বদলায় (ট্যাব/মোডাল/তালিকা/পাতার সাজ) ও পূর্বরূপ; layout-এর সাথে অসঙ্গত pack ধূসর ও কারণসহ।
3. **Colors** — তিনটি color picker + ৮টি তৈরি palette; primary খুব হালকা/খুব গাঢ় হলে contrast সতর্কতা (text স্বয়ংক্রিয় `on_primary`)।
4. **Style** — font, radius, density, card style, sidebar style, table style, login template: প্রতিটি segmented control।
5. **Logo & Favicon** — upload (PNG/SVG/WebP, ≤ 1MB; favicon ≤ 200KB)।
6. **Live preview** — ডানে একটি ছোট নকল dashboard, যা form state থেকে `ThemeProvider`-এর মতোই CSS variable নেয় — Save-এর আগে পরিবর্তন দেখা যায়। "Reset to preset" বাটন।

Super Admin-এর বাড়তি পেজ `/super-admin/theme-presets`: preset CRUD (একই editor + `allowed_types`, `is_premium`, preview image)।

---

## Subscription Plan Gating
| Capability | Tutor / Coaching / Basic | Pro | Enterprise |
|---|---|---|---|
| Free preset থেকে বাছাই (layout সহ) | ✅ | ✅ | ✅ |
| নিজের লোগো | ✅ | ✅ | ✅ |
| Premium preset | ❌ | ✅ | ✅ |
| Color, token, layout, UI pack আলাদাভাবে বদলানো | ❌ | ✅ | ✅ |
| Favicon | ❌ | ✅ | ✅ |
| "Powered by" সরানো (`white_label`) | ❌ | ❌ | ✅ |
| Super Admin যেকোনো কিছু সেট করে দেয় | ✅ সবসময় | ✅ | ✅ |

Flag: `plan.features.custom_branding` (Pro+), `white_label` (Enterprise)। লোগো upload সব plan-এ খোলা — এটি পুরনো ফাইলের gating টেবিল থেকে একমাত্র পরিবর্তন।

---

## Where Else the Brand Applies
- **PDF** (receipt, marksheet, ID card, admit card, certificate): header-এ লোগো ও নাম; accent line `primary_color`। Blade layout-এ `$theme = app(ThemeService::class)->getTheme($institution)`।
- **Email**: header bar `primary_color`, লোগো।
- **PWA manifest**: `GET /api/v1/manifest.webmanifest` dynamic (index.html: `<link rel="manifest" href="/api/v1/manifest.webmanifest">`) — `name`, `theme_color`, `icons` প্রতিষ্ঠানভেদে (host থেকে)।
- **SMS**: sender নাম হিসেবে প্রতিষ্ঠানের সংক্ষিপ্ত নাম message-এর শেষে।

## How to Add a New UI Pack Later
`docs/UI-PACKS.md` §১২ — manifest + `config/ui_packs.php` + preset row; কোনো page বা migration বদলায় না।

## How to Add a New Layout Later
1. `src/layouts/<Name>Layout.jsx` লিখুন — Layout Contract পূরণ করে, `parts/` ব্যবহার করে।
2. `registry.js`-এ এক লাইন; `ThemeService::LAYOUTS`-এ key যোগ।
3. `ThemeEditor`-এর layout তালিকায় thumbnail।
4. কোনো page, কোনো API, কোনো migration বদলাবে না।

## Notes / Edge Cases
- **অজানা `layout_key`** (পুরনো data) → backend `sidebar-classic`-এ fallback করে; frontend-ও `LAYOUTS[key] ?? DEFAULT`।
- **Preset মুছে ফেলা**: ব্যবহৃত হলে `422`; নিষ্ক্রিয় করতে `is_active = 0` (তালিকায় দেখাবে না, বিদ্যমান ব্যবহারকারীর কাছে চলবে)।
- **Plan downgrade** (Pro → Basic): বর্তমান চেহারা থেকে যায়, কিন্তু আর বদলানো যায় না; premium preset থাকলেও সরানো হয় না।
- **Role-ভিত্তিক layout**: student ও parent role-এ <1024px পর্দায় সবসময় `mobile-compact` আচরণ (bottom bar) — প্রতিষ্ঠানের layout যাই হোক; desktop-এ প্রতিষ্ঠানের layout।
- **Multi-branch**: branch নিজের theme রাখতে পারে; `theme_preset_id` NULL ও কোনো override না থাকলে head office-এর theme উত্তরাধিকার পায়।
- **Tests**: `ThemeResolutionTest` (resolution order, আটটি token সবসময় উপস্থিত, অবৈধ token বাতিল), `ThemeGatingTest` (Basic plan premium preset/token বদলাতে পারে না), frontend: প্রতিটি layout একই `nav` দিয়ে সব item render করে (Vitest) — `docs/TESTING.md` Revision 6।
