# theme-01 — Components (Classic Blue)

**কোন পার্থক্য কোন স্তরের:** এই থিমের সবকিছু বেসলাইন — token (L2), layout `sidebar-classic` (L3) এবং `classic` pack-এর default variant/view (L4–L5)। কোনো override নেই, তাই অন্য দুই থিমের COMPONENTS.md-এ "কী আলাদা" তা এই ফাইলের সাথে তুলনা।

component-এর **কাজ ও API** `docs/design/component-library.md`-এ। এখানে শুধু এই থিমে চেহারা। সব মান token-class (`docs/THEMING.md`); কোনো component-এ রঙ/radius/ছায়া লেখা নয় (`npm run lint:theme`)।

| Component | চেহারা (Classic Blue) | Token / class |
|---|---|---|
| **Button — primary** | নীল ভরাট, সাদা লেখা (6.52:1); hover = `hover:opacity-90`; focus = ২px `ring-primary-fg` + ২px offset; disabled = `opacity-50`, cursor-not-allowed | `bg-primary text-on-primary rounded-token` |
| **Button — secondary** | সাদা জমিন, `border-line`, `text-content`; hover = `bg-surface-muted` | `bg-surface border border-line text-content` |
| **Button — accent** | কমলা ভরাট, **গাঢ় লেখা** (6.23:1) — কখনো সাদা লেখা নয় | `bg-accent text-content` |
| **Button — danger** | লাল (status রঙ) ভরাট, সাদা লেখা | `bg-red-600 text-white` (status; theme রঙ নয়) |
| **Button — ghost / link** | জমিনহীন; লিঙ্ক = `text-primary-fg` + hover underline | `text-primary-fg hover:underline` |
| **Card** | সাদা, ১px `border-line`, ছায়া নেই, ৮px radius, `p-density` | `bg-surface border border-line rounded-token p-density` (`card_style=bordered`) |
| **StatCard** | Card + সংখ্যা ২৮px semibold `text-content`, লেবেল ১৩px `text-content-muted`, বামে ৪px উল্লম্ব `border-primary` দাগ; পরিবর্তন-তীর সবুজ/লাল (status) | `dashboard_variant=cards` |
| **DataTable** | হেডার `bg-surface-muted` + semibold; সারি-উচ্চতা `--row-h` (২.৭৫rem); সারি hover `bg-surface-muted`; নির্বাচিত সারি `bg-primary-soft`; zebra নেই | `table_style=plain` |
| **Pagination** | "← আগে  ১ ২ ৩ …  পরে →"; সক্রিয় পাতা `bg-primary text-on-primary` | |
| **StatusBadge** | pill; paid = সবুজ-হালকা/গাঢ়-সবুজ লেখা, due = হলুদ, overdue/absent = লাল, inactive = ধূসর; সবসময় **আইকন/লেখা** থাকে (রঙ-একা নয়) | status রঙ (থিম-নিরপেক্ষ) |
| **Form field** | লেবেল উপরে (১৪px medium), ইনপুট `border-line` ৮px, focus = `ring-primary-fg` + `border-primary`; ত্রুটি = লাল সীমা + নিচে লাল বার্তা; সাহায্যকারী লেখা `text-content-muted` | |
| **Select / DatePicker** | ফিল্ডের মতোই; DatePicker ক্যালেন্ডার-popover Card-স্টাইলে, সক্রিয় দিন `bg-primary text-on-primary` | |
| **Tabs** | নিচে ২px দাগ; সক্রিয় = `border-primary text-primary-fg`; নিষ্ক্রিয় = `text-content-muted` | |
| **ConfirmModal** | কেন্দ্রে ৪৮০px, `bg-surface rounded-token shadow-card`(মোডালে ছায়া অনুমোদিত), backdrop ৫০% কালো; ধ্বংসাত্মক ক্রিয়ায় danger বাটন ডানে; Esc বন্ধ করে | |
| **Toast** | উপরে-ডানে, ৪ সেকেন্ড; বামে status-রঙের দাগ + আইকন; screen-reader `aria-live="polite"` (ত্রুটি = `assertive`) | |
| **EmptyState** | কেন্দ্রে হালকা আইকন, এক লাইন বার্তা, একটি primary বাটন | |
| **Loader** | টেবিল/কার্ডে skeleton (`bg-surface-muted` পালস); পুরো-পাতায় কেন্দ্রীয় spinner (`text-primary-fg`) | |
| **PageHeader** | শিরোনাম ২২px semibold + ডানে ক্রিয়া-বাটন; উপশিরোনাম `text-content-muted` | |
| **Sidebar item** | উচ্চতা ৪০px; সক্রিয় = `bg-primary-soft text-primary-fg` + বামে ৩px `border-primary`; hover = `bg-surface-muted`; গ্রুপ-শিরোনাম ১২px uppercase-নয়, `text-content-muted` | `sidebar_style=light` |
| **Top bar** | ৫৬px, `bg-surface`, নিচে `border-line`; আইকন-বাটন ৪০px টাচ-সাইজ | |
| **Charts** | Recharts; প্রথম ধারা `var(--color-primary)`, দ্বিতীয় `var(--color-secondary)`, তৃতীয় `var(--color-accent)`; অক্ষ/গ্রিড `var(--line)`; হার্ডকোড hex নয় | |
| **Print (রসিদ, marksheet)** | সাদা-কালো-বান্ধব; হেডারে লোগো ও নাম, নিচে primary রঙের ১px লাইন; chrome লুকানো | `@media print` |

## অবস্থা-সারণি (প্রতিটি ইন্টার‍্যাক্টিভ উপাদানে আবশ্যক)
default · hover · focus-visible · active · disabled · loading (বাটনে spinner + `aria-busy`) · error (ফিল্ডে)। কীবোর্ড-ফোকাস সবসময় দৃশ্যমান (≥৩:১ ring)।

## Layout-নির্ভর নিয়ম (sidebar-classic)
- nav আইটেম `lucide-react` আইকন ২০px + লেবেল; আইকন-লেবেল ব্যবধান ১২px।
- sidebar-এর নিচে প্রতিষ্ঠানের নাম ছোট, সাথে "Powered by" (white-label না হলে)।
- পাতা-বিষয়বস্তুতে কোনো sidebar/topbar-নির্ভর মার্কআপ নয় (`docs/THEMING.md` Layout Contract)।

## ভাষা-টগল ও RTL (Revision 9)
| Component | এই থিমে |
|---|---|
| **LanguageSwitcher** | top bar ড্রপডাউন; লগইনে উপরে — শুধু চালু ভাষা, নিজ লিপিতে (বাংলা / English / العربية) |
| **DirIcon** | সব দিক-সূচক আইকন (`ChevronRight`, `ArrowLeft` …) এর মাধ্যমে; RTL-এ `rtl:-scale-x-100` |
| **Bidi** | নাম `dir="auto"`; ফোন/ID/ইমেইল/টাকা `dir="ltr"` |
| **Layout** | সব লেআউট-অংশ `docs/I18N.md` §৪.২-এর আয়না-সারণি মানে |
