# DESIGN SYSTEM

সব থিমের **সাধারণ** নিয়ম। থিম-নির্দিষ্ট সবকিছু `themes/theme-NN/`-এ; token-এর সংজ্ঞা, ব্যবস্থা ও প্রয়োগ `docs/THEMING.md`-এ; component-এর কাজ/API `docs/design/component-library.md`-এ।

## ০. থিম কতদূর আলাদা হতে পারে
থিম = L1 রঙ · L2 স্টাইল-টোকেন · L3 layout-শেল · **L4 component variant · L5 page view** (শেষ দুটি **UI Pack** — `docs/UI-PACKS.md`)। শুধু রঙ বদলে নয়, গঠনও বদলানো যায়, কিন্তু সীমিত ও চুক্তি-বাঁধা slot-এ; প্রতিষ্ঠান নিজে ডিজাইন করে না।

## ০ক. ভাষা ও দিক
UI তিন ভাষায় (বাংলা, English, العربية); আরবি **RTL**। প্রতিটি থিম, layout ও pack ডান-থেকে-বামে আয়না হয় — শুধু logical class, `DirIcon`, bidi-নিয়ম, লিপি-অনুযায়ী ফন্ট। সব নিয়ম `docs/I18N.md`; থিম-নির্দিষ্ট RTL আচরণ `themes/theme-NN/DESIGN.md`-এ।

## ১. নীতি
1. **Token-ই একমাত্র উৎস।** component-এ রঙ, radius, ছায়া, ফন্ট, ব্যবধান হার্ডকোড নয় (`npm run lint:theme` ধরে — D11)।
2. **Page layout ও pack জানে না।** sidebar/topbar/bottom-bar layout-এর কাজ; উপস্থাপনার ভিন্নতা `PageSlot`/variant-এর। page শুধু hook ডেকে `PageSlot`-এ দেয়; `ui_pack`/`layout_key` পড়ে না (`pack-leak` lint)।
3. **Status রঙ থিম-নিরপেক্ষ।** সফল=সবুজ, সতর্ক=হলুদ, ত্রুটি/বকেয়া=লাল; ব্র্যান্ড রঙে বদলায় না। রঙ-একা অর্থ বহন করে না (আইকন/লেখা সাথে)।
4. **প্রতিষ্ঠানের শব্দ।** "ক্লাস/সেকশন/ব্যাচ/কোর্স" `useTerms()` থেকে (D5)।
5. **মোবাইল-সক্ষম।** সব পাতা ৩৬০px-এ ব্যবহারযোগ্য; student/parent প্যানেল মোবাইল-প্রথম।

## ২. Token শব্দভাণ্ডার (সংক্ষেপ — সম্পূর্ণ `docs/THEMING.md`)
| বিষয় | Tailwind class | কীসের জন্য |
|---|---|---|
| জমিন | `bg-surface`, `bg-surface-muted` | কার্ড/পাতা; হালকা অঞ্চল |
| লেখা | `text-content`, `text-content-muted` | মূল; গৌণ |
| সীমা | `border-line`, `divide-line`, `bg-line` | বর্ডার, বিভাজক, ট্র্যাক |
| ব্র্যান্ড-ব্যাকগ্রাউন্ড | `bg-primary text-on-primary` | প্রধান বাটন, সক্রিয় pill |
| ব্র্যান্ড-লেখা | `text-primary-fg` | লিঙ্ক, সক্রিয় লেবেল (**ডার্ক-সেফ**; `text-primary` নেই) |
| ব্র্যান্ড-হালকা | `bg-primary-soft` | নির্বাচিত সারি, hover |
| গৌণ রঙ | `bg-secondary`, `bg-secondary-soft` | sidebar(brand), গাঢ় অঞ্চল |
| অ্যাকসেন্ট | `bg-accent text-content` | হাইলাইট। **সাদা লেখা নিষেধ; লেখার রঙ নয়** (সব থিমে < 3:1) |
| আকার | `rounded-token`, `p-density`, `h-row` (সারি), `shadow-card` | থিম-নির্ভর |
| ফন্ট | `font-body` | `font_family` token |

## ৩. টাইপ-স্কেল (প্রস্তাব — spike-এ যাচাই)
| ব্যবহার | আকার/ওজন | লাইন-হাইট |
|---|---|---|
| বডি | ১৬px / 400 | ১.৬ (বাংলার যুক্তাক্ষর ও মাত্রার জন্য; ১.৪ হলে কাটা লাগে) |
| ছোট/গৌণ | ১৩–১৪px / 400 | ১.৫ |
| ফর্ম লেবেল | ১৪px / 500 | ১.৫ |
| পাতার শিরোনাম | ২২px / 600 | ১.৩ |
| StatCard সংখ্যা | ২৬–২৮px / 600 | ১.২ |
ইনপুটের ফন্ট ≥ ১৬px (মোবাইলে অটো-জুম এড়াতে)। ফন্ট অ্যাপের সাথে bundle (`@fontsource/*`), গুগল-হোস্ট নয়। বাংলা ফন্টের বাস্তব ওজন-সমর্থন spike-এ যাচাই।

## ৪. Density ও ব্যবধান
`--space` ও `--row-h` token দিয়ে: `compact` (০.৬২৫rem/২.২৫rem), `comfortable` (১rem/২.৭৫rem — ডিফল্ট), `spacious` (১.৩৭৫rem/৩.২৫rem — মোবাইল-প্রথম)। ফিল্ড/বাটনের ন্যূনতম টাচ-লক্ষ্য ৪৪×৪৪px মোবাইলে।

## ৫. অ্যাক্সেসিবিলিটি বেসলাইন
| বিষয় | মান |
|---|---|
| লেখার কনট্রাস্ট | ≥ ৪.৫:১ (বড় লেখা ≥ ৩:১); UI-উপাদান/ফোকাস ≥ ৩:১ |
| প্রতিটি থিমের জন্য মাপা অনুপাত | `themes/theme-NN/TOKENS.md` (লিখিত, অনুমান নয়) |
| ডার্ক মোড | ব্র্যান্ড-লেখা `text-primary-fg` (খাঁটি primary ডার্কে ২.৭–৩.৩:১ — ব্যর্থ) |
| ফোকাস | `focus-visible` ring সবসময় দৃশ্যমান; কীবোর্ডে সব ক্রিয়া চলে; modal-এ focus trap, Esc বন্ধ |
| রঙ-একা নয় | status-এ আইকন/লেখা; চার্টে প্যাটার্ন/লেবেল |
| ছবি | অর্থবহ ছবিতে `alt`; সাজসজ্জা `alt=""` |
| ফর্ম | `<label>`-সংযুক্ত; ত্রুটি `aria-describedby`; `role="alert"` ত্রুটি-সারাংশে |
| Toast | `aria-live="polite"`; ত্রুটি `assertive` |
| গতি | `prefers-reduced-motion` মানে (flyout/transition বন্ধ বা তাৎক্ষণিক) |
| Forced colors / প্রিন্ট | `docs/THEMING.md` tokens.css এর fallback |
**স্বয়ংক্রিয় যাচাই:** CI-তে axe (Phase 8; `docs/reports/QUALITY-ANALYSIS.md` §৫.৩-৮)। বর্তমানে শুধু কনট্রাস্ট মাপা হয়েছে; কীবোর্ড/স্ক্রিন-রিডার হাতে পরীক্ষা বাকি।

## ৬. আইকন ও ছবি
`lucide-react` (সারি/মেনু: ২০px; রেল: ২৪px; ক্রিয়া-বাটন: ১৬–২০px)। emoji নয়। লোগো: প্রতিষ্ঠানের আপলোড (PNG/SVG/WebP ≤ ১MB), না থাকলে নামের আদ্যক্ষর `bg-primary`-তে।

## ৭. Print ও PDF
সাদা-কালো-বান্ধব; chrome লুকানো; হেডারে লোগো+নাম, primary রঙের ১px লাইন। PDF সার্ভারে (`docs/modules/pdf-reports.md`), থিমের রঙ `ThemeService::getTheme()` থেকে।

## ৮. খোলা সিদ্ধান্ত
- **সংখ্যার লিপি:** ডিফল্ট সব ভাষায় Latin অঙ্ক (`docs/I18N.md` §৩.৪); বাংলা/আরবি অঙ্ক `settings.digits = native` হিসেবে সম্ভাব্য, এখনো বানানো নেই — পণ্য-সিদ্ধান্ত `docs/I18N.md` §১৫।
- **ইংরেজি UI:** `en` অনুবাদ কতটা (সব, না মূল পাতা) — Release 1-এর সীমার সাথে ঠিক হবে।

## ৯. থিম যোগ/পরিবর্তনের নিয়ম
নতুন **থিম** = `theme_presets` row (Super Admin থেকে, কোড লাগে না) + (পূর্ণ নকশা চাইলে) `themes/theme-NN/` ফোল্ডারে চারটি ফাইল। নতুন **layout** = একটি ফাইল + registry-তে এক লাইন (`docs/THEMING.md` "How to Add a New Layout"); কোনো page বদলায় না। নতুন **token কী** = `ThemeTokensRule`, `tokens.css`, `docs/THEMING.md` Token Schema, ও এই ফাইল — চারটি একসাথে।
