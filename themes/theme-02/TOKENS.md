# theme-02 — Tokens (Modern Mint)

উৎস: `docs/THEMING.md` "Seeded Presets". অমিল হলে সেটি জেতে।

## ১. Seeder row
```json
{
  "key": "modern-mint",
  "name": "Modern Mint",
  "description": "আইকন-রেল, টিল; কোচিং ও দ্রুত দৈনন্দিন কাজের জন্য",
  "layout_key": "sidebar-mini",
  "ui_pack": "fresh",
  "primary_color": "#0F766E",
  "secondary_color": "#134E4A",
  "accent_color": "#F59E0B",
  "theme_mode": "light",
  "tokens": { "radius": "lg", "card_style": "shadow", "font_family": "anek-bangla" },
  "allowed_types": null,
  "is_premium": 0,
  "sort_order": 2
}
```

## ১ক. UI Pack (`fresh`)
| Slot | মান | স্তর/পর্যায় |
|---|---|---|
| `tabs` | `pill` | L4 · পর্যায় B |
| `modal` | `dialog` | (বেসলাইনের মতো) |
| `stat_card` | `bubble` | L4 · পর্যায় B |
| `list` | `table` | (বেসলাইনের মতো) |
| view `dashboard` | "আজকের batch" কার্ডসহ | L5 · পর্যায় C |
| view `students.quickAdd` | ৩-ঘরের দ্রুত ফর্ম | L5 · পর্যায় C |
| view `leads.board` | কানবান | L5 · পর্যায় C |
সঙ্গত layout: `sidebar-mini`, `sidebar-classic`, `topnav`, `mobile-compact` (`config/ui_packs.php`)।

## ২. কার্যকর token (বেসলাইন থেকে পার্থক্য চিহ্নিত)
| Token | মান | CSS ফল | বেসলাইন থেকে |
|---|---|---|---|
| `font_family` | `anek-bangla` | `--font-body: 'Anek Bangla', system-ui, sans-serif` | ✱ আলাদা |
| `radius` | `lg` | `--radius: 0.875rem` | ✱ আলাদা (৮→১৪px) |
| `density` | `comfortable` | `--space: 1rem; --row-h: 2.75rem` | একই |
| `card_style` | `shadow` | `--card-border: none; --card-shadow: 0 1px 3px rgb(0 0 0/.08), 0 8px 24px rgb(0 0 0/.06)` | ✱ আলাদা |
| `sidebar_style` | `light` | | একই |
| `table_style` | `plain` | | একই |
| `login_template` | `centered` | | একই |
| `dashboard_variant` | `cards` | | একই |

## ৩. কনট্রাস্ট (WCAG, মাপা)
| জোড়া | অনুপাত | ফল |
|---|---|---|
| সাদা লেখা / primary `#0F766E` (বাটন) | **5.47** | ✓ |
| primary লেখা/লিঙ্ক / সাদা (`text-primary-fg`) | 5.47 | ✓ |
| primary লেখা / `primary-soft #E2EFEE` | **4.64** | ✓ — সীমার কাছাকাছি (৪.৫); soft-এর উপর ছোট (<১৪px) primary লেখা এড়ান, `text-content` ব্যবহার করুন |
| সাদা লেখা / secondary `#134E4A` | 9.48 | ✓ |
| **সাদা লেখা / accent `#F59E0B`** | **2.15** | ✗ — নিষেধ |
| গাঢ় লেখা / accent | 8.26 | ✓ — accent বাটনে `text-content` |
| accent লেখা / সাদা | 2.15 | ✗ — accent কখনো লেখা নয় |
| dark: primary খাঁটি / `#0F172A` | **3.26** | ✗ — `text-primary-fg` (`#9FC8C5`) = **6.99** ✓ |
| dark: `primary-fg` / `#1E293B` | 5.73 | ✓ |
| dark: `primary-fg` / dark soft `#0F2C39` | 8.02 | ✓ |

## ৪. `shadow` কার্ড: অ্যাক্সেসিবিলিটি-সংক্রান্ত নোট
`card_style=shadow` কার্ড-সীমা সরিয়ে ছায়া দেয়। উচ্চ-কনট্রাস্ট/প্রিন্ট-এ ছায়া হারায়। তাই (ক) `@media (forced-colors: active)`-এ কার্ডে ১px `CanvasText` সীমা ফেরত; (খ) `@media print`-এ ছায়া বন্ধ + হালকা সীমা; (গ) ডার্ক মোডে `--card-shadow` বদলে `--line` সীমা ফেরত (ছায়া কালো জমিনে অদৃশ্য)। এটি `tokens.css`-এ যোগ করতে হবে (`DESIGN.md`)।
