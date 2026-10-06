# theme-01 — Tokens (Classic Blue)

উৎস: `docs/THEMING.md` ("Seeded Presets", "Token Schema"). এই ফাইলের মান ও সেখানকার মান **একই**; অমিল হলে `docs/THEMING.md` জেতে।

## ১. Seeder row (`theme_presets`)
```json
{
  "key": "classic-blue",
  "name": "Classic Blue",
  "description": "পরিচিত বাম-মেনু, নীল-সবুজ; school ও college-এর জন্য",
  "layout_key": "sidebar-classic",
  "ui_pack": "classic",
  "primary_color": "#185FA5",
  "secondary_color": "#0F6E56",
  "accent_color": "#E67E22",
  "theme_mode": "light",
  "tokens": {},
  "allowed_types": null,
  "is_premium": 0,
  "sort_order": 1
}
```
`tokens` ফাঁকা = সব মান default (নিচে)।

## ১ক. UI Pack (`classic`)
`tabs=underline` · `modal=dialog` · `stat_card=bar` · `list=table`; কোনো page-view override নেই। এটি বেসলাইন ও সব নতুন pack-এর ফলব্যাক (`docs/UI-PACKS.md` §৯)।

## ২. কার্যকর token (`DEFAULT_TOKENS` ← preset ← institution override)
| Token | মান | CSS ফল |
|---|---|---|
| `font_family` | `hind-siliguri` | `--font-body: 'Hind Siliguri', system-ui, sans-serif` |
| `radius` | `md` | `--radius: 0.5rem` |
| `density` | `comfortable` | `--space: 1rem; --row-h: 2.75rem` |
| `card_style` | `bordered` | `--card-border: 1px solid` (`--line`), `--card-shadow: none` |
| `sidebar_style` | `light` | `--sidebar-bg: var(--surface); --sidebar-text: var(--text)` |
| `table_style` | `plain` | কোনো zebra নেই |
| `login_template` | `centered` | মাঝখানে card, `bg-surface-muted` পটভূমি |
| `dashboard_variant` | `cards` | StatCard-এর গ্রিড (২–৪ কলাম) |

## ৩. পরিবর্তনযোগ্যতা (প্রতিষ্ঠান কী বদলাতে পারে)
- Free প্ল্যান: শুধু লোগো; প্রিসেট হিসেবে নিতে পারে।
- Pro+ (`custom_branding`): তিনটি রঙ, সব token, layout আলাদাভাবে।
- **ব্র্যান্ডের বাইরে যা বদলায় না:** status রঙ (লাল/সবুজ/হলুদ), text/surface স্কেল।

## ৪. কনট্রাস্ট (WCAG, মাপা; সূত্র: `on_primary` নিয়ম ও `tokens.css`)
| জোড়া | অনুপাত | ফল |
|---|---|---|
| লেখা `#111827` / সাদা জমিন | 17.74 | ✓ |
| muted লেখা `#6B7280` / সাদা | 4.83 | ✓ (AA, সামান্য মার্জিন) |
| muted লেখা / `surface-muted #F8FAFC` | 4.62 | ✓ (সামান্য মার্জিন — আরও হালকা muted রঙ নিষেধ) |
| সাদা লেখা / primary `#185FA5` (বাটন, brand sidebar) | **6.52** | ✓ |
| primary লেখা/লিঙ্ক / সাদা (`text-primary-fg`) | 6.52 | ✓ |
| primary লেখা / `primary-soft #E3ECF4` (সিলেক্টেড সারি) | 5.46 | ✓ |
| সাদা লেখা / secondary `#0F6E56` | 6.20 | ✓ |
| **সাদা লেখা / accent `#E67E22`** | **2.85** | ✗ — **accent-এর উপর সাদা লেখা নিষেধ** |
| গাঢ় লেখা `#111827` / accent | 6.23 | ✓ — accent বাটনে `text-content` |
| accent লেখা / সাদা | 2.85 | ✗ — accent কখনো লেখার রঙ নয় |
| **dark:** primary খাঁটি / `#0F172A` | **2.74** | ✗ — তাই `text-primary-fg` (৬০% primary + ৪০% সাদা) = **6.41** ✓ |
| dark: `primary-fg #A3BFDB` / `#1E293B` | 5.26 | ✓ |
| dark: `primary-fg` / dark soft `#112745` | 7.88 | ✓ |
**নিয়ম:** accent শুধু (ক) বর্ডার/আইকন/ছোট চিহ্ন, (খ) গাঢ় লেখাসহ ব্যাকগ্রাউন্ড হিসেবে। **কখনো** `text-white` + `bg-accent` নয়।

## ৫. Effective theme object (API — `GET /bootstrap` → `theme`)
```json
{ "preset_key": "classic-blue", "layout_key": "sidebar-classic", "ui_pack": "classic",
  "primary_color": "#185FA5", "secondary_color": "#0F6E56", "accent_color": "#E67E22", "on_primary": "#FFFFFF",
  "theme_mode": "light", "tokens": { "font_family": "hind-siliguri", "radius": "md", "density": "comfortable",
  "card_style": "bordered", "sidebar_style": "light", "table_style": "plain", "login_template": "centered", "dashboard_variant": "cards" } }
```
