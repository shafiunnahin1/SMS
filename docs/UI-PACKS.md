# UI PACKS — থিম মানে শুধু রঙ নয় (Revision 8)

> **কেন এই ফাইল:** মূল চাওয়া ছিল "আলাদা আলাদা থিমের জন্য আলাদা UI ও লেআউট"। এতদিন স্পেক দিত রঙ + ৮টি স্টাইল-টোকেন + ৪টি layout-শেল। কম্পোনেন্ট বা পাতার **গঠন** (ট্যাবের ধরন, মোডাল বনাম bottom sheet, টেবিল বনাম কার্ড-তালিকা, কানবান বোর্ড …) বদলানোর কোনো ব্যবস্থা ছিল না — অথচ `themes/theme-02`, `theme-03` সেগুলো ধরে নিয়ে লেখা ছিল। এই ফাইল সেই ব্যবস্থা: **UI Pack**।

## ১. উত্তর: কী কী করা যায়
| স্তর | কী বদলায় | কোথায় সংজ্ঞা | কে বদলাতে পারে | খরচ |
|---|---|---|---|---|
| **L1 ব্র্যান্ড** | ৩টি রঙ, লোগো, light/dark | `docs/THEMING.md` | প্রতিষ্ঠান | নেই |
| **L2 স্টাইল-টোকেন** | ফন্ট, গোলাকৃতি, ঘনত্ব, কার্ড/টেবিল/sidebar স্টাইল, লগইন-টেমপ্লেট, ড্যাশবোর্ড-ধরন | `docs/THEMING.md` | প্রতিষ্ঠান (Pro+) | নেই |
| **L3 Layout-শেল** | পুরো কাঠামো: sidebar / আইকন-রেল / top-nav / নিচের tab bar | `docs/THEMING.md` | প্রতিষ্ঠান (Pro+) | ছোট (১ ফাইল) |
| **L4 Component variant** | একই কাজ, ভিন্ন গঠন: Tabs (দাগ/pill), Modal (dialog/sheet), StatCard (দাগ/আইকন/compact), তালিকা (টেবিল/কার্ড) | **এই ফাইল** | প্ল্যাটফর্ম লেখে; প্রতিষ্ঠান *বাছে* | মাঝারি |
| **L5 Page view** | একই পাতার ভিন্ন সাজ: হাজিরা-নেওয়া (গ্রিড/segmented), লিড (তালিকা/কানবান), দ্রুত-ভর্তি, ড্যাশবোর্ড, ফি-আদায়, ছাত্র-তালিকা | **এই ফাইল** | প্ল্যাটফর্ম লেখে; প্রতিষ্ঠান *বাছে* | **বড়** (প্রতি pack × প্রতি view) |
| ~~L6 সম্পূর্ণ আলাদা frontend~~ | প্রতি থিমের নিজস্ব সব পাতা | — | — | N গুণ; **সুপারিশ করি না** |

**প্রতিষ্ঠান নিজে UI ডিজাইন করতে পারে না** (কাস্টম CSS/HTML/লেআউট-বিল্ডার নেই — নিরাপত্তা ও রক্ষণযোগ্যতা)। তারা প্ল্যাটফর্মের বানানো pack/preset *থেকে বাছে*। নতুন চেহারা চাইলে আপনি (প্ল্যাটফর্ম) pack বানান।

## ২. ধারণা
**UI Pack** = একটি নামযুক্ত সেট: (ক) প্রতিটি *component slot*-এ কোন variant, (খ) কোন *page slot*-এ বিকল্প view। `theme_presets.ui_pack` ও `institutions.ui_pack` (override) তাকে নির্দেশ করে।

মূল নীতি — **hook ও view আলাদা (headless):**
```
features/attendance/useAttendanceSheet.js   ← ডেটা, ক্রিয়া, যাচাই, permission — সব pack-এ এক
features/attendance/views/AttendanceTakeGrid.jsx        ← default view (classic)
ui/packs/mobile/views/AttendanceTakeSegmented.jsx       ← mobile pack-এর বিকল্প view
```
Pack শুধু **উপস্থাপনা** বদলায়। API, validation, permission, tenant-নিয়ম, তথ্য — কখনো নয়। তাই একটি ফিচার কেবল একটি pack-এ থাকতে পারে না।

## ৩. Slot-তালিকা (বদ্ধ — নতুন slot যোগ = এই ফাইল সংশোধন)
### Component slots (৪টি)
| Slot | Variant | বিবরণ |
|---|---|---|
| `tabs` | `underline` · `pill` | সক্রিয় ট্যাবের চিহ্ন |
| `modal` | `dialog` · `sheet` | কেন্দ্রীয় modal বনাম নিচ থেকে ওঠা sheet |
| `stat_card` | `bar` · `bubble` · `compact` | বামে দাগ / আইকন-গোল / ছোট সংখ্যা-সারি |
| `list` | `table` · `cards` | `DataTable`-এর উপস্থাপনা (≥৭৬৮px-এ pack ঠিক করে) |

### Page-view slots (৬টি)
| Slot | Hook | Default view | বিকল্পের উদাহরণ |
|---|---|---|---|
| `dashboard` | `useDashboard(role)` | StatCard-গ্রিড + চার্ট | "আজকের batch" কার্ড, compact |
| `students.list` | `useStudentList()` | টেবিল + ফিল্টার | কার্ড-সারি + FAB |
| `students.quickAdd` | `useStudentQuickAdd()` | পূর্ণ ভর্তি-ফর্ম (পাতা) | ৩-ঘরের দ্রুত ফর্ম / sheet |
| `attendance.take` | `useAttendanceSheet(batchId, date)` | সারি-গ্রিড | segmented তালিকা |
| `fees.collect` | `useFeeCollect(studentId)` | দুই-কলাম | এক-কলাম + নিশ্চিতকরণ sheet |
| `leads.board` | `useLeads()` | ফিল্টারযুক্ত তালিকা | কানবান কলাম |
বাকি সব পাতা সব pack-এ **একই view**। কোনো pack-এর জন্য ২টির বেশি নতুন slot-ভিত্তিক view চাইলে আগে খরচ-হিসাব (§১১)।

## ৪. ফ্রন্টেন্ড কাঠামো ও কোড
```
frontend/src/
├── features/<area>/use<Thing>.js        ← hook (logic)
├── features/<area>/views/<Thing>View.jsx ← default view
├── ui/
│   ├── UIProvider.jsx   useUI.js   PageSlot.jsx   packs.js (registry)
│   ├── variants/        Tabs.jsx  Modal.jsx  StatCard.jsx  List.jsx   ← slot-এর বাহ্যিক component; ভেতরে variant বাছে
│   └── packs/
│       ├── classic/manifest.js
│       ├── fresh/{manifest.js, views/*}
│       └── mobile/{manifest.js, views/*}
├── pages/…        ← route element: hook ডেকে <PageSlot name="…" {...hook} />
└── components/    ← বাকি shared component (সব token-class)
```
### Manifest
```js
// ui/packs/mobile/manifest.js
export default {
  key: 'mobile',
  components: { tabs: 'underline', modal: 'sheet', stat_card: 'compact', list: 'cards' },
  views: {                                                   // lazy: pack-এর chunk শুধু যার দরকার সে নামায়
    'attendance.take':  () => import('./views/AttendanceTakeSegmented'),
    'students.list':    () => import('./views/StudentListCards'),
    'students.quickAdd':() => import('./views/StudentQuickAddSheet'),
    'fees.collect':     () => import('./views/FeeCollectSingle'),
    'dashboard':        () => import('./views/DashboardToday'),
  },                                                          // ফাঁকা থাকা slot = default view
}
```
### Runtime
```jsx
// ui/UIProvider.jsx
const UICtx = createContext(null)
export function UIProvider({ children }) {
  const packKey = useInstitutionStore(s => s.theme?.ui_pack) ?? 'classic'
  const pack = PACKS[packKey] ?? PACKS.classic                  // unknown key => classic (never a blank page)
  return <UICtx.Provider value={pack}>{children}</UICtx.Provider>
}
export const useUI = () => useContext(UICtx)

// ui/variants/Tabs.jsx  - the ONLY Tabs pages and components import
export default function Tabs(props) {
  const { components } = useUI()
  const V = TABS[components.tabs] ?? TABS.underline              // each variant implements the SAME props
  return <V {...props} />
}

// ui/PageSlot.jsx
export default function PageSlot({ name, ...hook }) {           // hook = { state, data, actions }
  const { views } = useUI()
  const Default = DEFAULT_VIEWS[name]
  const Alt = useMemo(() => views[name] ? lazy(views[name]) : null, [views, name])
  return <Suspense fallback={<Loader />}>{Alt ? <Alt {...hook} /> : <Default {...hook} />}</Suspense>
}
```
```jsx
// pages/attendance/Take.jsx  - identical for every pack
export default function AttendanceTakePage() {
  const { batchId, date } = useParams()
  const sheet = useAttendanceSheet(batchId, date)               // logic, once
  return <PageSlot name="attendance.take" {...sheet} />         // presentation chosen by the pack
}
```
**বিধান:** page/component কখনো `ui_pack`, `preset_key`, `layout_key` পড়ে না, `ui/packs/**` import করে না (`infra/check-theme-rules.mjs` `pack-leak` নিয়ম)। শাখা-লেখা `if (pack === 'mobile')` নিষেধ — তা নতুন pack-এ ভাঙে।

## ৫. View চুক্তি — ফিচার হারানো ঠেকানো
প্রতিটি view পায় `{ state, data, actions }`। **নিয়ম:** `actions`-এর প্রতিটি কী-র জন্য view-তে ঠিক একটি উপাদান `data-action="<key>"` সহ থাকতে হবে (permission না থাকলে hook সেই action বাদ দেয়, view-ও দেখায় না)। `data` এর প্রতিটি তালিকা-আইটেম `data-row="<id>"`।
| Slot | `actions` (আবশ্যক `data-action`) | `data` (আবশ্যক দৃশ্যমান) |
|---|---|---|
| `attendance.take` | `setStatus` · `markAll` · `save` · `reset` | batch-নাম, তারিখ, প্রতিটি ছাত্র (`data-row`) ও তার status |
| `fees.collect` | `selectDue` · `setMethod` · `collect` · `printReceipt` | বকেয়া-লাইন, মোট, ছাড়, আদায়যোগ্য |
| `students.list` | `search` · `filter` · `open` · `add` | প্রতিটি ছাত্র (নাম, ID, batch, ফি-অবস্থা) |
| `students.quickAdd` | `setField` · `submit` · `cancel` | নাম, অভিভাবকের ফোন, batch (ন্যূনতম ৩টি) |
| `leads.board` | `moveTo` · `open` · `convert` · `add` | প্রতিটি lead ও তার status |
| `dashboard` | hook যা-ই দেয় | hook-এর প্রতিটি stat/তালিকা |
**Contract test** (`PackContractTest`) প্রতিটি `pack × slot`: একই fixture দিয়ে render; `actions`-এর কী-সেট `data-action`-সেটের সমান; প্রতিটি `data` আইটেম আছে; কীবোর্ডে প্রতিটি action পৌঁছায়; `axe` ০ গুরুতর লঙ্ঘন (Phase 8-এ axe যুক্ত হলে)। **একটি pack এই test পাস না করলে merge নয়।**

## ৬. Component variant চুক্তি
প্রতিটি variant একই props নেয়; পার্থক্য শুধু চেহারা/গঠন:
| Slot | Props (সবার জন্য এক) | অতিরিক্ত নিয়ম |
|---|---|---|
| `tabs` | `items[{key,label,badge?}]`, `value`, `onChange` | `role="tablist"`, তীর-কী, সক্রিয়ে `aria-selected` |
| `modal` | `open`, `onClose`, `title`, `children`, `actions` | focus trap, Esc/backdrop বন্ধ, `role="dialog"`; `sheet`-এ drag-handle দৃশ্যমান ও বন্ধ-বাটন |
| `stat_card` | `label`, `value`, `delta?`, `icon?`, `tone?` | সংখ্যা `text-content`; `delta` রঙ-একা নয় |
| `list` | `columns[{key,label,render,primary?}]`, `rows`, `onRowClick`, `selection?` | `cards`-এ `primary:true` কলাম শিরোনাম, প্রথম ৩ কলাম দৃশ্যমান; `table`-এ সব |
**দিক (RTL):** প্রতিটি variant ও view `dir=rtl`-এ ঠিকমতো আয়না হবে (logical class, `DirIcon`, ক্রম-উল্টানো `Tabs`/segmented/কানবান); `ComponentVariantContractTest` ও `PackContractTest` ltr **ও** rtl দুই রূপে চলে (`docs/I18N.md` §৪.২, §১৪)।

**সব pack-এ সাধারণ (pack-নিরপেক্ষ) responsive আচরণ:** <৭৬৮px-এ `modal` → sheet এবং `list` → cards **প্রতিটি pack-এ**। তাই student/parent (যারা <১০২৪px-এ forced `mobile-compact` পায়) যেকোনো pack-এ ঠিকমতো চলে। `mobile` pack এর বাইরে বাড়তি দেয় ≥৭৬৮px-এও এই গঠন এবং মোবাইল-অপ্টিমাইজড **view**।

## ৭. Layout-এর সাথে সঙ্গতি
`config/ui_packs.php`:
```php
return [
    'classic' => ['label' => ['bn' => 'ক্লাসিক', 'en' => 'Classic'], 'layouts' => ['sidebar-classic', 'sidebar-mini', 'topnav', 'mobile-compact']],
    'fresh'   => ['label' => ['bn' => 'ফ্রেশ',   'en' => 'Fresh'],   'layouts' => ['sidebar-mini', 'sidebar-classic', 'topnav', 'mobile-compact']],
    'mobile'  => ['label' => ['bn' => 'মোবাইল',  'en' => 'Mobile'],  'layouts' => ['mobile-compact']],     // bottom sheets / FAB only make sense with the tab-bar shell
];
```
`ThemeService`: প্রতিষ্ঠানের কার্যকর `(layout_key, ui_pack)` জোড়া অনুমোদিত না হলে 422। Preset seeder-ও এই জোড়া যাচাই করে (`ThemePresetSeederTest`)। (`student`/`parent`-এর forced mobile-compact সাময়িক শেল-বদল, সংরক্ষিত কনফিগ নয় — যাচাই প্রযোজ্য নয়, তাই §৬-এর সাধারণ responsive নিয়ম আবশ্যক।)

## ৮. Backend ও ডেটাবেস
- `theme_presets.ui_pack VARCHAR(30) NOT NULL DEFAULT 'classic'`; `institutions.ui_pack VARCHAR(30) NULL` (NULL = preset-এরটি) — `docs/database/schema.sql`। কলাম VARCHAR (D24-র মতো: নতুন pack-এ migration নয়)।
- `ThemeService::getTheme()`: `ui_pack = institution.ui_pack ?? preset.ui_pack ?? 'classic'`; অজানা মান → `classic`। Effective theme object-এ `ui_pack` যোগ (`docs/THEMING.md`)।
- `applyPreset()` `institutions.ui_pack = NULL` করে (preset-এরটি কার্যকর), `layout_key`/`theme_tokens`-এর মতোই।
- API: `PUT /admin/theme/pack { ui_pack }` (প্ল্যান: `custom_branding`), `GET /admin/theme` এ `available_packs[{key,label,layouts}]`। Super Admin একই (`/super/institutions/{id}/theme`)। Preset-এ pack Super Admin ঠিক করে।
- প্রতিটি পরিবর্তন `institution_theme_logs`-এ।
- **Plan gating:** preset-এর মাধ্যমে pack — সব প্ল্যান (বিনামূল্যে প্রিসেট); pack আলাদা বদলানো — Pro+ (`custom_branding`)।

## ৯. Release 1-এ প্যাক ও কী দেয়
| Pack | Theme | Component variant | Page view (বিকল্প) |
|---|---|---|---|
| `classic` | `theme-01` | `tabs=underline · modal=dialog · stat_card=bar · list=table` | — (default view-ই) |
| `fresh` | `theme-02` | `tabs=pill · modal=dialog · stat_card=bubble · list=table` | `dashboard` (আজকের batch) · `students.quickAdd` · `leads.board` (কানবান) |
| `mobile` | `theme-03` | `tabs=underline · modal=sheet · stat_card=compact · list=cards` | `dashboard` · `students.list` (কার্ড+FAB) · `students.quickAdd` (sheet) · `attendance.take` (segmented) · `fees.collect` (এক-কলাম+sheet) |
Layout-মালিকানার জিনিস (pack নয়): আইকন-রেল ও flyout (`sidebar-mini`), batch-সুইচার (top bar-এর "context" অংশ, `sidebar-mini` ও `mobile-compact`-এ যখন ধরনে batch আছে), নিচের tab bar।

## ১০. পর্যায়ক্রম (খরচ নিয়ন্ত্রণ)
| পর্যায় | কী | কখন |
|---|---|---|
| **A** | runtime (`UIProvider`, `useUI`, `PageSlot`, ৪টি variant component-এর **default** সহ), `classic` pack, contract test harness, `pack-leak` lint | Phase 3 (Step 3.6) — **Spike-এ শুধু এটি** |
| **B** | `fresh` ও `mobile`-এর *component variant* (৪টি slot) | Phase 5.4 (থিম-editor) — রঙ/layout/টোকেন + variant দিয়ে তিনটি থিম ইতিমধ্যে আলাদা দেখায় |
| **C** | page view-গুলো (`fresh`: ৩, `mobile`: ৫) | Spike-এর মাপ দেখে Phase 6.5 — **মালিকের অনুমোদনে** |
**সুপারিশ:** Release 1 পর্যায় A+B সহ বের করা; C পরে। কারণ C-তে প্রতিটি view এক-একটি বাড়তি রক্ষণ-দায়, আর সেটি সত্যিই লাগে কি না তা প্রকৃত ব্যবহারকারী দেখার আগে জানা যায় না।

## ১১. খরচ ও সীমা (সৎভাবে)
- **রক্ষণ-ম্যাট্রিক্স:** (pack-সংখ্যা) × (override-করা view) = বাড়তি view। ৩ pack × ৬ slot = সর্বোচ্চ ১২টি অতিরিক্ত view (classic শূন্য ধরে)। প্রতিটি নতুন ফিচার-বদল (যেমন হাজিরায় "ছুটি" status) **প্রতিটি override-এ** হাত দেয় — contract test এটি ধরে (action-সেট মিলে না), কিন্তু কাজ কমায় না।
- **কোনো সময়-সংখ্যা এখানে নেই।** Spike-এ একটি view (`attendance.take`-এর একটি বিকল্প) বানিয়ে প্রকৃত খরচ মাপা হবে (`docs/spike/walking-skeleton.md` ধাপ S5b)।
- **দৃশ্যমান পরীক্ষা (visual regression):** ৩ pack × ৬ view × ২ ভিউপোর্ট স্ক্রিনশট পরীক্ষা দরকার; স্পেকে E2E/Playwright এখনো নেই (`docs/reports/QUALITY-ANALYSIS.md` §৩ M4)। pack বাড়ানোর আগে এটি যোগ হওয়া উচিত।
- **Bundle:** pack-এর view lazy chunk; `fresh`/`mobile` ব্যবহারকারী শুধু নিজেরটি নামায়। component variant ছোট, সবার সাথে।
- **অ্যাক্সেসিবিলিটি** প্রতিটি pack-এ আলাদা করে দায়বদ্ধ (`docs/DESIGN-SYSTEM.md` §৫); নতুন variant মানে নতুন কীবোর্ড/ফোকাস আচরণ।
- **যা এই ব্যবস্থা দেয় না:** প্রতিষ্ঠান-নির্দিষ্ট কাস্টম পাতা; একই pack-এ দুই role-এ ভিন্ন view (role-ভিত্তিক view-বাছাই চাইলে আলাদা সিদ্ধান্ত); pack-এ নতুন ফিচার।

## ১২. নতুন pack / view / variant যোগ
1. **Pack:** `ui/packs/<key>/manifest.js` + `config/ui_packs.php` entry (layouts সহ) + `theme_presets` row (`ui_pack`) + `themes/theme-NN/` ফোল্ডারে নথি। কোনো page বদলায় না, কোনো migration নয়।
2. **View override:** `ui/packs/<key>/views/<X>.jsx` + manifest-এ এক লাইন; `PackContractTest` সবুজ।
3. **নতুন slot:** (ক) এই ফাইলের তালিকা, (খ) default view/variant, (গ) hook (logic), (ঘ) contract সারণি, (ঙ) `PackContractTest` fixture — এগুলো সব একসাথে।
4. **নতুন variant (বিদ্যমান slot-এ):** variant component + `TABS`-ধাঁচের map-এ এক লাইন + §৬-এর চুক্তি মানা।

## ১৩. মালিকের সিদ্ধান্ত বাকি
1. Release 1: পর্যায় A+B (সুপারিশ) নাকি C-ও?
2. Pack কি থিম-প্রিসেটের অংশ মাত্র থাকবে, নাকি প্রতিষ্ঠান আলাদা বাছতে পারবে (Pro+)? (ডিফল্ট প্রস্তাব: Pro+ আলাদা বাছতে পারে, `layouts` সঙ্গতি মেনে)।
3. Visual regression/Playwright কবে যোগ হবে (pack বাড়ানোর আগে)?
