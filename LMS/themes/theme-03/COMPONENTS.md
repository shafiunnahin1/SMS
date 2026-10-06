# theme-03 — Components (Tutor Lite)

বেসলাইন `themes/theme-01/COMPONENTS.md`; এখানে শুধু পার্থক্য।

## কোন পার্থক্য কোন স্তরে
| পার্থক্য | স্তর | কোথায় সংজ্ঞা | পর্যায় |
|---|---|---|---|
| বেগুনি/কমলা রঙ | L1 | preset | A |
| ২০px radius, বড় ঘনত্ব (`spacious`), compact ড্যাশবোর্ড-ধরন | L2 টোকেন | preset `tokens` | A |
| নিচের tab bar, `max-w-md`, safe-area | L3 layout (`mobile-compact`) | `docs/THEMING.md` | A |
| bottom sheet | **L4** `modal=sheet` | `docs/UI-PACKS.md` §৩ | B |
| compact StatCard | **L4** `stat_card=compact` | একই | B |
| কার্ড-তালিকা (টেবিল নয়) | **L4** `list=cards` | একই | B |
| হোম "আজকের ব্যাচ" কার্ড | **L5** `dashboard` | একই | C |
| ছাত্র-তালিকা কার্ড + FAB | **L5** `students.list` | একই | C |
| দ্রুত-ভর্তি sheet | **L5** `students.quickAdd` | একই | C |
| segmented হাজিরা | **L5** `attendance.take` | একই | C |
| এক-কলাম ফি-আদায় + sheet | **L5** `fees.collect` | একই | C |
**পর্যায় A+B-তে** এই থিম: tab bar, বড় টাচ-লক্ষ্য, sheet-মোডাল, কার্ড-তালিকা, compact StatCard — অর্থাৎ ফোনে ব্যবহারযোগ্য। **segmented হাজিরা/FAB/দ্রুত-ভর্তি sheet পর্যায় C**-র; তার আগে একই কাজ বেসলাইন view-তে (৩৬০px-এও চলে, কিন্তু কম অপ্টিমাইজড)।

| Component | Tutor Lite-এ পার্থক্য | Token / মাপ |
|---|---|---|
| **Button** | উচ্চতা ৪৮px, মোবাইলে পূর্ণ-প্রস্থ (গৌণ বাটন ছাড়া); ২০px radius (প্রায় pill); primary = বেগুনি, সাদা লেখা 5.70:1; accent = কমলা + **গাঢ় লেখা** 6.33:1 | `rounded-token`, `p-density` |
| **Card** | ২০px radius, `bordered`; ভিতরের প্যাডিং `--space` (২২px) | |
| **StatCard (compact)** | ছোট: সংখ্যা ২০px + এক-লাইন লেবেল; তিনটি পাশাপাশি; কোনো আইকন নয় | `dashboard_variant=compact` |
| **List row (ছাত্র/বকেয়া)** | কার্ড-সারি, উচ্চতা ≥ `--row-h` (৫২px); বামে অবতার-আদ্যক্ষর (`bg-primary-soft text-primary-fg`), মাঝে নাম+উপ-লেখা, ডানে ক্রিয়া-আইকন/chip | |
| **Table → CardList** | `list=cards` (সব প্রস্থে); প্রতি সারি = কার্ড, `primary:true` কলাম শিরোনাম, প্রথম ৩ কলাম দৃশ্যমান, বাকি ট্যাপে; অনুভূমিক scroll নয় | `ui/variants/List.jsx` |
| **Segmented control** (হাজিরা) | তিন সমান ভাগ, প্রতিটি ≥ ৪৮px; নির্বাচিত = `bg-primary text-on-primary`; বাকি `bg-surface-muted`; উপস্থিত/অনুপস্থিত/দেরি-র **লেখা** থাকে (রঙ-একা নয়) | |
| **Form field** | উচ্চতা ৪৮px, ফন্ট ১৬px, লেবেল উপরে; সঠিক `inputmode` (`tel`, `decimal`, `numeric`); `autocomplete`; ত্রুটি ঘরের নিচে + `aria-describedby` | |
| **Bottom tab bar** | ৬৪px + safe-area; প্রতি tab আইকন ২৪px + লেবেল ১২px; সক্রিয় = `text-primary-fg` + উপরে ৩px `bg-primary` দাগ; নিষ্ক্রিয় `text-content-muted` (4.83:1); ব্যাজ (বকেয়া সংখ্যা) লাল গোল | `MobileCompactLayout` |
| **Top bar** | ৫৬px; প্রতিষ্ঠানের নাম/পাতার শিরোনাম; ডানে 🔔; "পিছনে" তীর ভিতরের পাতায় | |
| **Bottom sheet** | ২০px উপরের radius, drag-handle, backdrop; সর্বোচ্চ উচ্চতা ৮৫vh; ভিতরে স্ক্রল; ফোকাস-ট্র্যাপ | `rounded-t-token` |
| **FAB (ছাত্র যোগ)** | ছাত্র-তালিকায় নিচে-ডানে ৫৬px গোল, `bg-primary text-on-primary`; tab bar-এর ১৬px উপরে | |
| **Toast** | নিচে (tab bar-এর উপরে), ৪ সেকেন্ড; Undo বাটনসহ ("পূর্বাবস্থা") | |
| **Filter chips** | অনুভূমিক scroll চলে (শুধু chip-এর জন্য); সক্রিয় `bg-primary-soft text-primary-fg border-primary` | |
| **EmptyState** | বড় আইকন + এক লাইন + পূর্ণ-প্রস্থ বাটন ("প্রথম batch তৈরি করুন") | |
| **Loader** | skeleton কার্ড; পুল-টু-রিফ্রেশ ঐচ্ছিক | |
| **Charts** | সরল (বার/লাইন), একক ধারা প্রধানত `var(--color-primary)`; লেবেল ≥ ১২px; ছোট পর্দায় অক্ষ-লেবেল কমানো | |
| **Print/PDF (রসিদ)** | বেসলাইনের মতো (সাদা-কালো-বান্ধব, লোগো) — PDF সার্ভারে তৈরি, ফোনে শেয়ার-শিট (`navigator.share`) বিকল্প | |

## মোবাইল-নির্দিষ্ট আবশ্যিক ব্যবস্থা
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`; `html, body { height: 100% }`; safe-area `padding-bottom: env(safe-area-inset-bottom)` tab bar-এ (`docs/modules/public-website.md` ও `docs/THEMING.md` এর অনুরূপ নিয়ম)।
- `overscroll-behavior: contain` bottom sheet-এ (পেছনের পাতা স্ক্রল না হওয়া)।
- কীবোর্ড খোলায় স্থির tab bar লুকানো (`visualViewport` ব্যবহার করে) যাতে ইনপুট ঢাকা না পড়ে।

## ভাষা-টগল ও RTL (Revision 9)
| Component | এই থিমে |
|---|---|
| **LanguageSwitcher** | ‘আরও’ পাতার উপরে পূর্ণ-প্রস্থ সারি; লগইনে ছোট বাটন — শুধু চালু ভাষা, নিজ লিপিতে (বাংলা / English / العربية) |
| **DirIcon** | সব দিক-সূচক আইকন (`ChevronRight`, `ArrowLeft` …) এর মাধ্যমে; RTL-এ `rtl:-scale-x-100` |
| **Bidi** | নাম `dir="auto"`; ফোন/ID/ইমেইল/টাকা `dir="ltr"` |
| **Layout** | সব লেআউট-অংশ `docs/I18N.md` §৪.২-এর আয়না-সারণি মানে |
