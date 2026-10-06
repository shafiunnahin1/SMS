# theme-03 — Tokens (Tutor Lite)

উৎস: `docs/THEMING.md` "Seeded Presets". অমিল হলে সেটি জেতে।

## ১. Seeder row
```json
{
  "key": "tutor-lite",
  "name": "Tutor Lite",
  "description": "মোবাইল-প্রথম, নিচে tab bar; প্রাইভেট শিক্ষক ও কোচিংয়ের জন্য",
  "layout_key": "mobile-compact",
  "ui_pack": "mobile",
  "primary_color": "#7C3AED",
  "secondary_color": "#4C1D95",
  "accent_color": "#F97316",
  "theme_mode": "light",
  "tokens": { "radius": "xl", "density": "spacious", "dashboard_variant": "compact" },
  "allowed_types": ["private_batch", "coaching"],
  "is_premium": 0,
  "sort_order": 4
}
```

## ১ক. UI Pack (`mobile`)
| Slot | মান | স্তর/পর্যায় |
|---|---|---|
| `tabs` | `underline` | (বেসলাইন) |
| `modal` | `sheet` (সব প্রস্থে) | L4 · পর্যায় B |
| `stat_card` | `compact` | L4 · পর্যায় B |
| `list` | `cards` (সব প্রস্থে) | L4 · পর্যায় B |
| view `dashboard` | আজকের কাজ | L5 · পর্যায় C |
| view `students.list` | কার্ড-সারি + FAB | L5 · পর্যায় C |
| view `students.quickAdd` | bottom sheet | L5 · পর্যায় C |
| view `attendance.take` | segmented তালিকা | L5 · পর্যায় C |
| view `fees.collect` | এক-কলাম + নিশ্চিতকরণ sheet | L5 · পর্যায় C |
সঙ্গত layout: শুধু `mobile-compact` (`config/ui_packs.php`)। student/parent যেকোনো pack-এ <১০২৪px-এ forced `mobile-compact` পায় — তাদের জন্য সাধারণ responsive নিয়ম (`docs/UI-PACKS.md` §৬)।

## ২. কার্যকর token
| Token | মান | CSS ফল | বেসলাইন থেকে |
|---|---|---|---|
| `font_family` | `hind-siliguri` | `--font-body: 'Hind Siliguri', …` | একই |
| `radius` | `xl` | `--radius: 1.25rem` (২০px) | ✱ আলাদা |
| `density` | `spacious` | `--space: 1.375rem; --row-h: 3.25rem` (৫২px সারি) | ✱ আলাদা |
| `card_style` | `bordered` | `--card-border: 1px solid` (`--line`) | একই |
| `sidebar_style` | `light` | (এই layout-এ sidebar নেই; tab bar `bg-surface`) | — |
| `table_style` | `plain` | (টেবিল মোবাইলে কার্ড-তালিকা) | — |
| `login_template` | `centered` | | একই |
| `dashboard_variant` | `compact` | একক-কলাম, ছোট StatCard-সারি + "আজকের কাজ" তালিকা | ✱ আলাদা |

## ৩. Layout-নির্দিষ্ট মাপ (token নয়, `MobileCompactLayout` ধ্রুবক)
| বিষয় | মান | কারণ |
|---|---|---|
| Tab bar উচ্চতা | ৬৪px + `env(safe-area-inset-bottom)` | নাগাল + notch |
| Tab আইটেম | সর্বোচ্চ ৫ (৪ `primary` + "আরও") | ফিটস ৩৬০px-এ ≥ ৭২px প্রতিটি |
| ন্যূনতম টাচ-লক্ষ্য | ৪৮×৪৮px (WCAG ন্যূনতম ৪৪) | আঙুল |
| ইনপুট ফন্ট | ≥ ১৬px | iOS অটো-জুম বন্ধ |
| কনটেন্ট প্রস্থ | `max-w-md` (২৮ rem) কেন্দ্রে | ডেস্কটপেও অ্যাপ-সদৃশ |
| পাতার নিচের ফাঁক | tab bar-এর উচ্চতা + ১৬px | শেষ উপাদান ঢাকা না পড়া |

## ৪. কনট্রাস্ট (WCAG, মাপা)
| জোড়া | অনুপাত | ফল |
|---|---|---|
| সাদা লেখা / primary `#7C3AED` (বাটন) | **5.70** | ✓ |
| primary লেখা/লিঙ্ক / সাদা (`text-primary-fg`) | 5.70 | ✓ |
| primary লেখা / `primary-soft #EFE7FD` | **4.75** | ✓ (সীমার কাছাকাছি) |
| সাদা লেখা / secondary `#4C1D95` | 10.95 | ✓ |
| **সাদা লেখা / accent `#F97316`** | **2.80** | ✗ — নিষেধ |
| গাঢ় লেখা / accent | 6.33 | ✓ |
| accent লেখা / সাদা | 2.80 | ✗ |
| dark: primary খাঁটি / `#0F172A` | **3.13** | ✗ — `text-primary-fg` (`#CBB0F8`) = **6.57** ✓ |
| dark: `primary-fg` / `#1E293B` | 5.39 | ✓ |
| dark: `primary-fg` / dark soft `#271F55` | 7.86 | ✓ |
| tab bar: নিষ্ক্রিয় আইকন+লেবেল `--text-muted #6B7280` / সাদা | 4.83 | ✓ (লেবেল সবসময় থাকে) |

## ৫. `allowed_types` প্রয়োগ
`ThemeService::applyPreset()` — প্রতিষ্ঠানের `institution_type` `allowed_types`-এ না থাকলে 422 "এই থিম এই ধরনের প্রতিষ্ঠানের জন্য নয়"। তাই school/college Admin এই থিম বাছতে পারে না; Super Admin-ও না (preset সীমা প্রযোজ্য) — ব্যতিক্রম লাগলে `allowed_types` সম্পাদনা।
