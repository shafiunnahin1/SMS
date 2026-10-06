# Quick Wins — প্রতিষ্ঠান-পরিচয়, QR যাচাই, অ্যাক্সেসিবিলিটি মোড, শিফট (Revision 12)

> চারটি ছোট-কিন্তু-মূল্যবান ফিচার, প্রায় নতুন টেবিল ছাড়াই। **নতুন module key নেই** (বিদ্যমান মডিউলের সম্প্রসারণ)।

## ১. প্রতিষ্ঠান-পরিচয় ক্ষেত্র (EIIN, বোর্ড/কেন্দ্র কোড, MPO সূচক — ঐচ্ছিক, D44)
- `institutions.settings.identifiers`: `{ eiin, board_codes: [{ board, code }], center_code, other: [{ label, value }] }`; `teachers.mpo_index_no VARCHAR(30)` — **ঐচ্ছিক (D44)**: শুধু `settings.ownership` = `mpo`/`government` হলে দেখায়, বেসরকারিতে ডিফল্টে লুকানো। EIIN ও বোর্ড-কোড সব প্রতিষ্ঠানেরই ঐচ্ছিক ক্ষেত্র।
- **কোনো ফরম্যাট-বৈধতা নেই** (দৈর্ঘ্য/অঙ্ক-সংখ্যা আমি যাচাই করিনি) — শুধু সর্বোচ্চ ২০ অক্ষর। মান থাকলে সনদ, TC, ID কার্ড (পিছনে), marksheet, admit card, রসিদের শিরোনামে ছাপা (তালিকা `settings.identifiers_print`)।
- Super Admin ও প্রতিষ্ঠান-Admin সম্পাদনা; প্ল্যান-নিরপেক্ষ। পরীক্ষা: `IdentifiersPrintTest` (মান থাকলে ছাপা, না থাকলে লাইনই নেই), `IdentifiersPublicTest` (পাবলিক সাইটে প্রকাশ শুধু `settings.public.show_identifiers` চালু থাকলে)।

## ২. সনদ/TC-তে QR যাচাই (`verify_code`, `revoked_at`)
- `certificates` ও `tc_certificates`-এ `verify_code VARCHAR(16)` (+ `UNIQUE (institution_id, verify_code)`), `revoked_at`। কোড = ১২ অক্ষর, বিভ্রান্তিকর অক্ষর (০/O, ১/I/L) বাদ দেওয়া ৩২-চিহ্নের বর্ণমালা ⇒ ~৬০ বিট; ইস্যুর মুহূর্তে CSPRNG-এ তৈরি।
- PDF-এ QR = `https://<প্রতিষ্ঠানের-host>/verify/<code>` (+ ছাপা কোড)। **পাবলিক পাতা** (`GET /public/verify/{code}`, tenant host, throttle ৩০/মিনিট/IP): প্রতিষ্ঠানের নাম, নথির ধরন ও নম্বর, ইস্যুর তারিখ, ধারকের **আংশিক-মাস্ক নাম** ("রা*** আ***"), অবস্থা (`বৈধ` | `বাতিল` | `পাওয়া যায়নি`)। আর কোনো তথ্য নয়।
- বাতিল: `revoked_at` বসে (কোড মোছা নয়), পাতা "বাতিল (তারিখ)" দেখায়; কারণ Admin-এর কাছে, পাবলিকে নয়। অনুসন্ধান-রোধ: ভুল কোডে একই ধীর উত্তর, গণনা-প্রতিরোধ throttle।
- **রসিদ/marksheet-এ QR এই সংস্করণে নেই** (আর্থিক/ফল-তথ্য ফাঁসের ঝুঁকি বনাম লাভ); চাইলে আলাদা সিদ্ধান্ত।
- **স্বাক্ষর/সিলের ছবি:** `institutions.settings.signatures` `{ principal, seal, class_teacher }` (ছবি **private disk**, শুধু PDF-এ বসে); স্বাক্ষর ব্যক্তিগত তথ্য — API-তে ফেরত যায় না।
- পরীক্ষা: `VerifyCodeTest` (বর্ণমালা, দৈর্ঘ্য, unique), `VerifyPageTest` (মাস্ক, অবস্থা, কোনো বাড়তি তথ্য নেই), `VerifyThrottleTest`, `RevokeTest`, `VerifyTenancyTest` (অন্য প্রতিষ্ঠানের কোড "পাওয়া যায়নি"), `SignatureSecrecyTest`।

## ৩. অ্যাক্সেসিবিলিটি মোড (ব্যবহারকারী-পছন্দ)
- `users.ui_preferences` (JSON): `{ "font_scale": 1 | 1.15 | 1.3 | 1.5, "high_contrast": false, "dyslexia_font": false, "reduce_motion": false, "wide_spacing": false }`। লগইনের আগে localStorage, পরে সার্ভারে (সব ডিভাইসে একই)। UserMenu/লগইন পাতায় "দৃশ্য-সহায়তা" প্যানেল।
- `ThemeProvider` `<html>`-এ `data-font-scale`, `data-contrast="high"`, `data-dyslexia`, `data-spacing="wide"`, `data-motion="reduce"` বসায়; `tokens.css` `rem`/ভেরিয়েবলে সাড়া দেয় (কম্পোনেন্টে px-হার্ডকোড নিষিদ্ধ — Layout Contract)।
- **হাই-কনট্রাস্ট প্যালেট (যাচাইকৃত অনুপাত, সাদা জমিনে):**
  | থিম | brand primary | হাই-কনট্রাস্ট primary | অনুপাত |
  |---|---|---|---|
  | Classic Blue | `#185FA5` | `#17599B` (৬% গাঢ়) | **7.15:1** |
  | Modern Mint | `#0F766E` | `#0D635C` (১৬% গাঢ়) | **7.10:1** |
  | Tutor Lite | `#7C3AED` | `#6B32CC` (১৪% গাঢ়) | **7.11:1** |
  লেখা `#000000` = **21:1**; গৌণ লেখা `#374151` = **10.31:1**; সীমারেখা `#4B5563` = **7.56:1** (UI-উপাদানের ন্যূনতম ৩:১-এর চেয়ে অনেক বেশি)। ছায়া বন্ধ, সব কার্ডে ১px সীমা (`shadow` থিমও), accent শুধু সাজ (লেখা নয়)।
- **dyslexia-বান্ধব ফন্ট:** Latin/ইংরেজির জন্য সম্ভব; **বাংলা/আরবির জন্য আমি প্রকৃত dyslexia-ফন্ট জানি না** — তাই এই দুই ভাষায় বিকল্প = `wide_spacing` (অক্ষর/শব্দ/লাইন-ব্যবধান বাড়ানো)। ফন্ট-প্যাকেজ নাম যাচাই `docs/I18N.md` §৪.৪-এর মতোই বাকি।
- `font_scale` ১.৫-এ ৩৬০px-এ কোনো লেআউট ভাঙে না (বিশেষত `mobile-compact` tab bar, বাটন ≥৪৪px বজায়, লেবেল ২ লাইনে) — E2E (`docs/E2E-TESTING.md`)। `reduce_motion` OS-সেটিং `prefers-reduced-motion`-ও মানে।
- পরীক্ষা: `UiPreferencesTest` (বৈধ মানের সেট, সার্ভার-সিঙ্ক), `HighContrastPaletteTest` (উপরের অনুপাত ≥৭), Playwright-এ `font_scale 1.5` × ৩ থিম × RTL স্ন্যাপশট।

## ৪. শিফট ব্যবস্থাপনা (সকাল/দিন/সন্ধ্যা)
- `batches.shift` (`morning|day|evening|NULL`), `routine_blocks.shift` (NULL = সব শিফট); `settings.shifts` = চালু শিফট-তালিকা ও প্রতিটির সময়-পরিসর (`{ morning: "07:30-12:00", day: "12:30-17:00" }`)।
- **প্রভাব:** (ক) রুটিনে batch-এর শিফটের সময়-পরিসরের বাইরে ক্লাস বসালে সতর্কতা (`academics-advanced.md` §৪ সংঘর্ষ-নিয়মের অংশ); (খ) বিরতি/নামাজ-ব্লক শিফট-ভিত্তিক; (গ) হাজিরা-দেরি-সীমা শিফটের শুরু থেকে (devices, `attendance-devices.md`); (ঘ) ID কার্ড/প্রবেশপত্রে শিফট; (ঙ) রিপোর্ট ও ফিল্টার শিফট-অনুযায়ী; (চ) শ্রেণিকক্ষ-ব্যবহার সময়-ভিত্তিক বলে একই কক্ষ দুই শিফটে ব্যবহারে অসুবিধা নেই।
- ফি/ছুটি/পরীক্ষা শিফট-নিরপেক্ষ (প্রতিষ্ঠান বদলাতে চাইলে আলাদা সিদ্ধান্ত)। পরীক্ষা: `ShiftRoutineTest`, `ShiftBlockTest`, `ShiftLateThresholdTest`।

## ৫. Done When
- [ ] মান বসালে সনদে EIIN ছাপা, না বসালে লাইনই নেই
- [ ] সনদ ইস্যু → QR স্ক্যান → "বৈধ" + মাস্ক নাম; বাতিল করলে "বাতিল"; ভুল কোডে কিছুই ফাঁস হয় না
- [ ] `font_scale 1.5` + হাই-কনট্রাস্ট + RTL-এ তিন থিমে ফোনে (৩৬০px) ব্যবহারযোগ্য; কনট্রাস্ট ≥ ৭:১
- [ ] দুই শিফটের demo-তে একই কক্ষ দুই ব্যাচে, সংঘর্ষ নেই; শিফটের বাইরে ক্লাসে সতর্কতা
