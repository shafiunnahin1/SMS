# theme-02 — Components (Modern Mint)

বেসলাইন: `themes/theme-01/COMPONENTS.md`। নিচে **শুধু যা আলাদা**; বাকি সব হুবহু বেসলাইন (token বদলালে নিজে থেকে বদলায়)।

## কোন পার্থক্য কোন স্তরে (কী *সত্যিই* কোন ব্যবস্থায় চলে)
| পার্থক্য | স্তর | কোথায় সংজ্ঞা | পর্যায় |
|---|---|---|---|
| টিল/অ্যাম্বার রঙ | L1 | preset | A |
| ১৪px radius, ছায়া-কার্ড, Anek Bangla | L2 টোকেন | preset `tokens` | A |
| আইকন-রেল + flyout, batch-সুইচার | L3 layout (`sidebar-mini`) | `docs/THEMING.md` | A |
| pill-ট্যাব | **L4** `tabs=pill` | `docs/UI-PACKS.md` §৩ | B |
| আইকন-গোল StatCard | **L4** `stat_card=bubble` | একই | B |
| "আজকের batch" ড্যাশবোর্ড | **L5** view `dashboard` | একই | C |
| দ্রুত-ভর্তি (৩ ঘর) | **L5** view `students.quickAdd` | একই | C |
| কানবান লিড-বোর্ড | **L5** view `leads.board` | একই | C |
**পর্যায় A/B ছাড়া এই থিম বেসলাইনের চেয়ে শুধু রঙ, গোলাকৃতি, ছায়া, ফন্ট ও আইকন-রেল।** L5 view পর্যায় C-র (মালিকের অনুমোদনে) জন্য।

| Component | Modern Mint-এ পার্থক্য | Token |
|---|---|---|
| **Button** | ১৪px radius (pill নয়); primary = টিল, সাদা লেখা 5.47:1; accent = অ্যাম্বার + **গাঢ় লেখা** 8.26:1 | `rounded-token` |
| **Card** | সীমা নেই, নরম ছায়া; ডার্ক মোডে ছায়া → ১px `--line` সীমা | `shadow-card`, `.dark` override |
| **StatCard** | বামে-দাগ নয়; উপরে-বামে ৪০px গোল আইকন (`bg-primary-soft text-primary-fg`); সংখ্যা ২৬px | |
| **DataTable** | বেসলাইনের মতো `plain`; কিন্তু সারি `rounded-token` hover-হাইলাইট; নির্বাচিত `bg-primary-soft` | |
| **Form field** | ১৪px radius ইনপুট; লেবেল উপরে; focus ring `ring-primary-fg` | |
| **Tabs** | নিচের দাগের বদলে **pill-ট্যাব** (`bg-primary-soft text-primary-fg` সক্রিয়, `rounded-token`) | |
| **Sidebar rail item** | ৪৮×৪৮ বর্গ, `rounded-token`; সক্রিয় `bg-primary-soft` + আইকন `text-primary-fg`; flyout panel = Card (ছায়া) | `sidebar_style=light` |
| **Flyout menu** | ২২০px, `shadow-card`, গ্রুপ-নাম semibold; আইটেম উচ্চতা ৪০px; `role="menu"`, তীর-কী নেভিগেশন | |
| **Batch switcher** | top bar-এ combobox; প্রতিটি বিকল্পে batch-নাম + সময় + ছাত্র-সংখ্যা; সাম্প্রতিক ৫টি উপরে | coaching-নির্দিষ্ট |
| **Kanban column (Lead)** | `bg-surface-muted rounded-token`, কার্ড-ড্র্যাগ + কীবোর্ড (`Space` তুলুন, তীর সরান) | |
| **Toast / Modal** | বেসলাইন; modal ১৪px radius | |
| **Charts** | বেসলাইনের মতো; টিল/গাঢ়-টিল/অ্যাম্বার ধারা — **অ্যাম্বার ধারার উপর সাদা লেবেল নয়**; দুই সন্নিহিত ধারা আলাদা করতে প্যাটার্ন/আকার (রঙ-একা নয়) | |
| **Login (`centered`)** | বেসলাইনের মতো; card-এ ছায়া | |

## ফন্ট-নোট (`anek-bangla`)
- Anek Bangla সহজলভ্য ওজন সীমিত হতে পারে — ব্যবহৃত ওজন (400/500/600) প্রকৃত সংস্করণে আছে কি না **spike-এ যাচাই** করুন; না থাকলে `font-synthesis` বন্ধ রেখে নিকটতম ওজন। ফন্ট অ্যাপের সাথে bundle (`@fontsource/*`), গুগল-হোস্ট নয় (গোপনীয়তা ও CSP; `docs/AUTHORIZATION.md` Token Strategy)।
- ফন্ট না লোড হলে ফলব্যাক `system-ui` — লাইন-হাইট বাংলার জন্য ১.৬ (`docs/DESIGN-SYSTEM.md`)।

## ভাষা-টগল ও RTL (Revision 9)
| Component | এই থিমে |
|---|---|
| **LanguageSwitcher** | top bar pill + user menu — শুধু চালু ভাষা, নিজ লিপিতে (বাংলা / English / العربية) |
| **DirIcon** | সব দিক-সূচক আইকন (`ChevronRight`, `ArrowLeft` …) এর মাধ্যমে; RTL-এ `rtl:-scale-x-100` |
| **Bidi** | নাম `dir="auto"`; ফোন/ID/ইমেইল/টাকা `dir="ltr"` |
| **Layout** | সব লেআউট-অংশ `docs/I18N.md` §৪.২-এর আয়না-সারণি মানে |
