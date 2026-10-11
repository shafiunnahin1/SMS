# Question Bank — প্রশ্নব্যাংক, কনসেপ্ট, প্রশ্নপত্র, কুইজ (D65)

> **অবস্থা: খসড়া — মালিকের অনুমোদনের অপেক্ষায়।** D65 অনুযায়ী এজেন্ট এই স্পেক লিখেছে; মালিক পড়ে অনুমোদন দিলে (বা বদলাতে বললে) তবেই কোড। নিচের "খোলা সিদ্ধান্ত" (OD-qb-…) মালিকের উত্তরের অপেক্ষায়; উত্তর না আসা পর্যন্ত সেই অংশের কোড হবে না, বা ধরে-নেওয়া মানটি স্পষ্ট লেখা আছে।
> **উৎস:** মালিকের কথা — `owner/question-bank-notes.md`; মালিকের আগের প্রজেক্ট `shafiunnahin1/qbank` (Laravel 13 + Blade) শুধু **যুক্তি ও নিয়মের উৎস** — কোড এখানে নতুন করে লেখা হয় (api: Laravel 12, frontend: React), D65।
> **মডিউল-কী:** `question_bank` (প্রশ্ন, কনসেপ্ট, রিসোর্স, প্রশ্নপত্র) ও `quiz` (শিক্ষার্থীর অনলাইন কুইজ ও প্যাকেজ)। ধরন: school · college · coaching · private_batch সবগুলোতে।

---

## ১. কে কী করে (ভূমিকা)

| ভূমিকা | কোথায় | কী করে |
|---|---|---|
| `super_admin` | central (`admin.<base>`) | পাঠ্যক্রম (শ্রেণি → বিষয় → অধ্যায় → টপিক), প্রশ্ন-ধরন, **সব দাম**, বিনামূল্য/আংশিক-বিনামূল্য, লেখক যোগ, কুইজ-প্যাকেজ |
| `content_writer` **(নতুন, প্ল্যাটফর্মের)** | central — **লেখক-প্যানেল** | টপিক-ভিত্তিক প্রশ্ন, উত্তর, ব্যাখ্যা, কনসেপ্ট লেখে; স্লাইড/বই/PDF আপলোড করে; নিজের লেখা `draft → review` পাঠায় |
| `content_moderator` **(নতুন, প্ল্যাটফর্মের)** | central — লেখক-প্যানেল | `review` কনটেন্ট যাচাই করে `published` বা ফেরত (কারণসহ) |
| `admin` (প্রধান শিক্ষক) | প্রতিষ্ঠানের host | প্রতিষ্ঠানের **সব শিক্ষকের প্রশ্নপত্র** দেখে; প্রতিষ্ঠানের ওয়ালেট থেকে কোন শিক্ষক কত টাকার প্রশ্ন নিয়েছেন তার হিসাব দেখে; নিজেও প্রশ্নপত্র বানায় |
| `teacher` | প্রতিষ্ঠানের host | প্রশ্ন খোঁজে ও দেখে (বিনামূল্যে); উত্তর দেখা/প্রশ্নপত্রে ব্যবহারের জন্য **প্রতিষ্ঠানের ওয়ালেট থেকে** কেনে; প্রতিষ্ঠানের প্রশ্নপত্র বানায় |
| শিক্ষক — **নিজের প্রাইভেট ব্যাচে** | তাঁর `private_batch` প্রতিষ্ঠানের host | একই কাজ, টাকা **তাঁর প্রাইভেট-ব্যাচের ওয়ালেট** থেকে (= "ব্যক্তিগত ওয়ালেট"); অন্য প্রতিষ্ঠানে কেনা জিনিস এখানে **আবার কিনতে হয়** |
| `student` | প্রতিষ্ঠানের host — **শিক্ষার্থী-পোর্টাল** | প্রশ্ন দেখে প্রস্তুতি; টপিক-ভিত্তিক কনসেপ্ট; অনলাইন কুইজ; উত্তর দেখা ও কুইজ-প্যাকেজ কেনে **bKash-এ, প্ল্যাটফর্মের মার্চেন্টে** |

**"ব্যক্তিগত ওয়ালেট" = শিক্ষকের প্রাইভেট-ব্যাচ প্রতিষ্ঠানের ওয়ালেট।** এই প্ল্যাটফর্মে প্রতিটি user এক প্রতিষ্ঠানের (D25); শিক্ষক নিজের প্রাইভেট ব্যাচ খুললে সেটি আলাদা প্রতিষ্ঠান (`institution_type = private_batch`) আর তার নিজের ওয়ালেট আছে। তাই মালিকের নিয়ম — "প্রতিষ্ঠানের কেনা প্রশ্ন প্রাইভেট-ব্যাচ পোর্টালে আবার কিনতে হবে" — tenant-বিচ্ছিন্নতা থেকেই আপনাআপনি সত্য হয়; আলাদা "ব্যক্তিগত ওয়ালেট" টেবিল লাগে না।

**শিক্ষার্থী-লগইন:** R1-এ `student` রোল বন্ধ (`config/release.php`)। এই মডিউলের সাথে শিক্ষার্থী-লগইন ও শিক্ষার্থী-পোর্টাল চালু হয় (task QB.9) — R1.1-এর `student` অংশ এখানে আগে আসে।

---

## ২. দুই ধরনের ডেটা — প্ল্যাটফর্ম-কনটেন্ট বনাম প্রতিষ্ঠানের ডেটা

| ধরন | উদাহরণ | `institution_id` | নিয়ম |
|---|---|---|---|
| **প্ল্যাটফর্ম-কনটেন্ট (catalogue)** | পাঠ্যক্রম, প্রশ্ন, কনসেপ্ট, রিসোর্স, প্রশ্ন-ধরন, দাম, কুইজ-প্যাকেজ | **নেই** | সব প্রতিষ্ঠান **পড়ে** (published হলে); লেখে শুধু central-এর লেখক/মডারেটর/Super Admin। মডেলগুলো `BelongsToInstitution`-এর বাইরে — D25-এর ব্যতিক্রম-তালিকায় নাম লিখে যোগ (`PlatformCatalogue` trait: প্রতিষ্ঠানের host থেকে শুধু `published` পড়া যায়, লেখা নিষেধ; ভাঙলে exception) |
| **প্রতিষ্ঠানের ডেটা** | কেনা (unlock), প্রশ্নপত্র, শিক্ষার্থীর কেনা, কুইজ-চেষ্টা, ওয়ালেট-লেনদেন | **আছে** | `BelongsToInstitution` (fail-closed), অন্য প্রতিষ্ঠানের সারি 404 — CrossTenantRouteTest/TenantIsolationTest-এ প্রতিটি নতুন route |

**উত্তর কখনো ফাঁস নয়:** প্রশ্নের API-Resource উত্তর/সঠিক-বিকল্প/ব্যাখ্যা দেয় **শুধু** যখন ওই প্রতিষ্ঠানের (শিক্ষক) বা ওই শিক্ষার্থীর unlock আছে, অথবা আইটেমটি বিনামূল্যে। বিকল্পের `is_correct` কখনো unlock ছাড়া JSON-এ যায় না (পরীক্ষা: `QuestionAnswerNeverLeaksTest`)।

---

## ৩. টেবিল (প্রস্তাবিত; অনুমোদনের পর `docs/database/schema.sql`-এ যোগ — task QB.0)
সব টেবিলের নাম `qb_` দিয়ে শুরু — এই প্ল্যাটফর্মের `subjects`, `exams`, `institutions`-এর সাথে সংঘর্ষ এড়াতে (qbank-এ একই নাম আছে)।

**ক. পাঠ্যক্রম (প্ল্যাটফর্ম)**
- `qb_class_levels` (name_bn, name_en, education_level — `primary|secondary|higher_secondary|madrasa|technical|admission|other`, sort_order) — প্রতিষ্ঠানের `programs` এর সাথে ঐচ্ছিক মিল: `programs.qb_class_level_id` (nullable) → শিক্ষার্থী নিজের শ্রেণির কনটেন্ট আগে দেখে।
- `qb_subjects` (name_bn, name_en, code), `qb_class_level_subject` (pivot)
- `qb_chapters` (qb_subject_id, name_bn, name_en, number, sort_order), `qb_chapter_class_level` (pivot — একই অধ্যায় একাধিক শ্রেণিতে)
- `qb_topics` (qb_chapter_id, name_bn, name_en, sort_order)

**খ. প্রশ্ন (প্ল্যাটফর্ম)** — qbank-এর মডেল থেকে
- `qb_question_types` (slug, name_bn, name_en, family — `mcq|creative|short|fill_gap|matching|true_false|ordering|writing|other`, ui_config JSON, is_active, sort_order) — qbank-এর ~৭৭টি slug সিড হিসেবে আসে।
- `qb_questions` (qb_question_type_id, qb_topic_id, qb_chapter_id, qb_subject_id, difficulty 1–5, marks DECIMAL(5,2), language `bn|en`, content_mode `plain_text|rich_math|mixed`, question_json, question_text, answer_json, answer_text, explanation_json, explanation_text, status `draft|review|published|rejected`, review_note, created_by, reviewed_by, published_at, timestamps, soft delete)
- `qb_question_options` (qb_question_id, label, content_json, content_text, is_correct, sort_order)
- `qb_creative_parts` (qb_question_id, part_label ক/খ/গ/ঘ, cognitive_level `knowledge|understanding|application|higher_order`, marks, question_json/text, answer_json/text)
- `qb_question_items` / `qb_question_stimuli` — ফাঁকা-পূরণ, ম্যাচিং, অনুচ্ছেদ-ভিত্তিক প্রশ্নের কাঠামো (qbank-এর structured model; task QB.4)
- `qb_question_class_level` (pivot), `qb_question_occurrences` (board, institution_name, exam_type, year — "কোন বোর্ড-পরীক্ষায় এসেছিল")
- `qb_question_revisions` (qb_question_id, snapshot JSON, edited_by) — লেখকের প্রতিটি সংরক্ষণ
- `qb_media` (path on the platform's private disk, mime, size, uploaded_by) + `qb_media_links` (polymorphic) — ছবি, ডায়াগ্রাম

**গ. কনসেপ্ট ও রিসোর্স (প্ল্যাটফর্ম)**
- `qb_concepts` (qb_topic_id, title_bn, title_en, body_json, body_text, status, created_by, reviewed_by)
- `qb_resources` (kind `slide|book|pdf`, title, scope: qb_subject_id / qb_chapter_id / qb_topic_id (একটি), file → `qb_media`, page_count, status)

**ঘ. দাম ও বিনামূল্য (প্ল্যাটফর্ম)** — §৪
- `qb_prices` (audience `institution|student`, item_kind `question_answer|concept|resource_slide|resource_book|resource_pdf|quiz_package`, qb_question_type_id nullable — `question_answer`-এর জন্য ধরনভেদে, amount DECIMAL(10,2), effective_from) — দাম বদলালে **নতুন সারি**, পুরনো কেনার দাম বদলায় না
- `qb_free_rules` (target_type `question_type|subject|chapter|topic|concept|resource|class_level`, target_id, audience, mode `free|partial`, partial_value, starts_at, ends_at nullable, note) — §৪.৩

**ঙ. কেনা ও ওয়ালেট (প্রতিষ্ঠানের)**
- `qb_unlocks` (**institution_id**, item_type `question|concept|resource`, item_id, unlocked_by user_id, price DECIMAL(10,2), reason `paid|free|partial_free`, wallet_txn_ref, created_at) — UNIQUE(institution_id, item_type, item_id): **একবার কিনলে ওই প্রতিষ্ঠানের সব শিক্ষক** (মালিকের নিয়ম)। কখনো মোছা নয় (D32)।
- শিক্ষার্থীর কেনা: `qb_student_unlocks` (**institution_id**, student_user_id, item_type, item_id, price, payment_ref) — UNIQUE(student_user_id, item_type, item_id)
- `qb_student_orders` (**institution_id**, student_user_id, items JSON (server-calculated), amount, bkash payment_id, status `pending|paid|failed`, ref) — bKash প্ল্যাটফর্মের মার্চেন্টে (D58-এর একই BkashService), callback central host-এ

**চ. প্রশ্নপত্র (প্রতিষ্ঠানের)**
- `qb_papers` (**institution_id**, created_by, title, program_id nullable, qb_subject_id, exam_name, duration_minutes, total_marks, instructions_json, status `draft|final`, sets count)
- `qb_paper_sections` (qb_paper_id, title, instruction, sort_order), `qb_paper_items` (qb_paper_section_id, qb_question_id, marks, sort_order) — প্রশ্নপত্রে যোগ করতে হলে প্রশ্নটি ওই প্রতিষ্ঠানের unlock-এ থাকতে হবে (না থাকলে যোগ করার সময় কেনা হয়, শিক্ষক নিশ্চিত করলে)
- PDF: Chromium (D50), বাংলা যুক্তাক্ষর; উত্তরপত্রসহ/ছাড়া; সেট A/B (প্রশ্ন ও বিকল্পের ক্রম এলোমেলো)

**ছ. কুইজ (শিক্ষার্থী)**
- `qb_quiz_packages` (প্ল্যাটফর্ম: title, qb_class_level_id, qb_subject_id nullable, description, quiz count, price → `qb_prices`, is_active)
- `qb_quizzes` (প্ল্যাটফর্ম: qb_quiz_package_id nullable, title, scope (subject/chapter/topic), duration_minutes, question count, rule `fixed|random_from_scope`, pass_mark)
- `qb_quiz_questions` (qb_quiz_id, qb_question_id, sort_order) — শুধু স্বয়ং-মূল্যায়নযোগ্য ধরন (mcq, true_false, fill_gap, matching)
- `qb_quiz_attempts` (**institution_id**, student_user_id, qb_quiz_id, started_at, submitted_at, score, total, answers JSON) — উত্তর-মিলানো **server-এ**; সময় শেষ হলে server নিজে জমা নেয়

---

## ৪. দাম, কেনা ও বিনামূল্য

### ৪.১ কী বিনামূল্যে, কী দামে
- **প্রশ্ন দেখা** (প্রশ্নের লেখা, বিকল্প — সঠিকটি চিহ্ন ছাড়া): সবার জন্য **বিনামূল্যে**।
- **উত্তর দেখা** ও **প্রশ্নপত্রে ব্যবহার:** প্রশ্ন-ধরনভেদে দাম (`qb_prices`, audience `institution` — যেমন বহুনির্বাচনী ০.৫০, সৃজনশীল ২.০০ টাকা)। একবার কেনা (`qb_unlocks`) দুটোই খোলে — ধরে-নেওয়া, **OD-qb-3**।
- **কনসেপ্ট, স্লাইড, বই, PDF:** **দামসহ** (মালিক, 2026-10-11); Super Admin চাইলে বিনামূল্যে বা আংশিক বিনামূল্যে (§৪.৩)।
- **শিক্ষার্থী:** উত্তর দেখা ও কুইজ-প্যাকেজ — দাম `qb_prices` audience `student` (শিক্ষক-দাম থেকে আলাদা হতে পারে, **OD-qb-4**)।

### ৪.২ টাকা কোথা থেকে
- **প্রতিষ্ঠানের জন্য** (শিক্ষক/প্রধান শিক্ষক, প্রতিষ্ঠানের host): প্রতিষ্ঠানের ওয়ালেট — ধরে-নেওয়া: **SMS-এর একই টাকার ওয়ালেট** (`institutions.sms_balance`, D56; ledger `sms_credit_transactions`-এ নতুন type `qb_purchase`) — এক ব্যালেন্স, এক রিচার্জ (D58) — **OD-qb-1** (আলাদা ওয়ালেট চাইলে নতুন কলাম ও ledger)।
- **ব্যক্তিগত** (শিক্ষকের প্রাইভেট-ব্যাচ host): সেই প্রাইভেট-ব্যাচ প্রতিষ্ঠানের ওয়ালেট — একই কোড, অন্য tenant।
- **শিক্ষার্থী:** bKash, প্ল্যাটফর্মের মার্চেন্টে (মালিক) — কোনো ওয়ালেট নয়; প্রতি অর্ডারে পেমেন্ট (`qb_student_orders`)।
- কেনা = এক DB-transaction: ওয়ালেট-সারি lock → ব্যালেন্স যথেষ্ট কি (না হলে 402 `wallet_balance_too_low`) → ledger-সারি → `qb_unlocks`। একই আইটেম দুবার কেনা যায় না (UNIQUE); দুই শিক্ষক একসাথে কিনলে একজনেরই টাকা কাটে (lock)।
- দাম **server** নির্ধারণ করে (`QbPricingService::priceFor(audience, item)`); client কোনো অঙ্ক পাঠায় না (G9)।

### ৪.৩ বিনামূল্য ও আংশিক-বিনামূল্য (Super Admin)
`qb_free_rules` দিয়ে, সবচেয়ে নির্দিষ্ট নিয়ম জেতে (আইটেম > টপিক > অধ্যায় > বিষয় > শ্রেণি > প্রশ্ন-ধরন):
- `mode = free` — ওই লক্ষ্যের সব আইটেম বিনামূল্যে (সময়সীমাসহ বা ছাড়া, যেমন প্রচার-সপ্তাহ)।
- `mode = partial` — **আংশিক বিনামূল্যে**, ধরে-নেওয়া অর্থ: (ক) সংগ্রহের প্রথম `partial_value`টি আইটেম বিনামূল্যে (যেমন প্রতি টপিকের প্রথম ৫টি প্রশ্নের উত্তর), (খ) বই/PDF/স্লাইডে প্রথম `partial_value` পাতা বিনামূল্যে প্রিভিউ, বাকিটা কিনতে হয় — **OD-qb-2** (মালিক "আংশিক" মানে অন্য কিছু বোঝালে বদলাবে; যেমন ছাড় %)।
- বিনামূল্যে খোলা জিনিসও `qb_unlocks`-এ `reason=free` সারি পায় (হিসাব ও "কে কী দেখল" স্পষ্ট), দাম ০।

### ৪.৪ প্রতিষ্ঠানের হিসাব
`GET /question-bank/spending?from=&to=` (admin): শিক্ষক-ভিত্তিক মোট টাকা, আইটেম-সংখ্যা, ধরনভেদে — `qb_unlocks.unlocked_by` থেকে (মালিক: "প্রতিষ্ঠান দেখতে পারবে কোন শিক্ষক কত টাকার প্রশ্ন প্রতিষ্ঠানের জন্য তৈরী করতেছে")। ঐচ্ছিক সীমা: শিক্ষক-প্রতি মাসিক খরচ-সীমা (`institutions.settings.qb_teacher_monthly_cap`) — **OD-qb-5**।

---

## ৫. পাতা (React)

**central — লেখক-প্যানেল** (`content_writer`, `content_moderator`, `super_admin`):
- পাঠ্যক্রম-গাছ (শ্রেণি → বিষয় → অধ্যায় → টপিক) — Super Admin সম্পাদনা করে
- প্রশ্ন-এডিটর: ধরন বেছে → প্রশ্ন, বিকল্প/অংশ, উত্তর, ব্যাখ্যা; বাংলা/ইংরেজি; গণিত (LaTeX); ছবি; প্রিভিউ; সংরক্ষণে revision; `review`-এ পাঠানো
- কনসেপ্ট-এডিটর (টপিক-ভিত্তিক), রিসোর্স-আপলোড (স্লাইড/বই/PDF)
- মডারেটরের রিভিউ-সারি: published / ফেরত (কারণ)
- Super Admin: দাম (`qb_prices`), বিনামূল্য-নিয়ম, কুইজ-প্যাকেজ, লেখক/মডারেটর যোগ, লেখক-ভিত্তিক কাজের হিসাব

**প্রতিষ্ঠানের host — শিক্ষক/প্রধান শিক্ষক:**
- প্রশ্নব্যাংক: গাছ ও ফিল্টার (শ্রেণি, বিষয়, অধ্যায়, টপিক, ধরন, কঠিনতা, বোর্ড-বছর), খোঁজা; প্রশ্ন দেখা; "উত্তর দেখুন (৳০.৫০)" → নিশ্চিতকরণ → কেনা
- প্রশ্নপত্র-নির্মাতা: অংশ যোগ, প্রশ্ন টেনে আনা, নম্বর, সেট; কেনা-বাকি প্রশ্নের মোট দাম দেখিয়ে একবারে নিশ্চিত; PDF (উত্তরসহ/ছাড়া)
- "আমার প্রশ্নপত্র" (শিক্ষক) / "সব প্রশ্নপত্র" (প্রধান শিক্ষক)
- খরচের হিসাব (প্রধান শিক্ষক)
- কনসেপ্ট ও রিসোর্স দেখা/কেনা

**শিক্ষার্থী-পোর্টাল:**
- নিজের শ্রেণির বিষয় → অধ্যায় → টপিক; প্রশ্ন দেখে প্রস্তুতি; কনসেপ্ট
- উত্তর/কনসেপ্ট/প্যাকেজ কেনা (bKash)
- কুইজ: শুরু → সময়-গণনা → জমা → ফল ও ব্যাখ্যা (কেনা থাকলে) → নিজের ফলের ইতিহাস

সব পাতা বিদ্যমান নিয়মে: `useTerms()`, থিম-token, `t()` (bn/en), দিক-নিরপেক্ষ class, loading/empty/error, ৩৬০px (AGENTS.md নিয়ম ৯)।

---

## ৬. qbank থেকে কী আসে, কীভাবে
| qbank-এ | এখানে |
|---|---|
| প্রশ্ন-মডেল (types, options, creative parts, structured items, occurrences, revisions) | `qb_*` টেবিলে একই ধারণা, `institution_id` ছাড়া (catalogue) |
| `AnswerPricingService`, `WalletService::purchaseAnswerUnlock` | `QbPricingService`, `QbPurchaseService` — এই প্ল্যাটফর্মের ওয়ালেট ও ledger (D56) |
| bKash top-up | বিদ্যমান `BkashService` (D58) — নতুন gateway কোড নয় |
| Subscriptions (ছাড়-প্ল্যান) | **এই সংস্করণে নেই** — পরে, মালিক চাইলে (OD-qb-6) |
| প্রশ্নপত্র, সেট/সাবসেট | `qb_papers` + Chromium-PDF |
| OMR প্রিন্ট/স্ক্যান, PDF/AI আমদানি, ~৫০ ডায়াগ্রাম-এডিটর | **পরের ধাপ** (QB.11+) — প্রথম সংস্করণে মূল ধরনগুলো ও ছবি |
| Blade + JS পাতা | React-এ নতুন করে |
| qbank-এর বিদ্যমান প্রশ্ন ও পাঠ্যক্রম-ডেটা | **আমদানি-কমান্ড** `qb:import-from-qbank` (qbank-এর ডেটাবেস থেকে, dry-run আগে) — মালিকের লেখা প্রশ্ন হারায় না (QB.10) |

নতুন frontend লাইব্রেরি (গণিত-এডিটর MathLive, qbank-এ যা আছে) একটি নতুন dependency — G7; **OD-qb-7** (মালিকের অনুমোদন সেই task-এর আগে)।

---

## ৭. Task-পরিকল্পনা (প্রস্তাব)
| Task | কী | পূর্বশর্ত |
|---|---|---|
| QB.0 | schema.sql-এ `qb_*` টেবিল, মডিউল-কী, ভূমিকা (`content_writer`, `content_moderator`), `PlatformCatalogue` নিয়ম ও আর্কিটেকচার-পরীক্ষা | স্পেক অনুমোদন, Task A |
| QB.1 | পাঠ্যক্রম: টেবিল, Super Admin CRUD ও পাতা, সিড (qbank-এর শ্রেণি/বিষয়) | QB.0 |
| QB.2 | লেখক-প্যানেল ভিত্তি: লেখক/মডারেটর যোগ, লগইন central-এ, revision, review-প্রবাহ | QB.1 |
| QB.3 | প্রশ্ন (মূল ধরন: mcq, creative, short, true_false, fill_in_the_blank, one_word) — API ও এডিটর (লেখা, গণিত, ছবি) | QB.2 |
| QB.4 | বাকি ধরন (structured: gap/cloze/matching/rearrange …) | QB.3 |
| QB.5 | কনসেপ্ট ও রিসোর্স (স্লাইড/বই/PDF; প্রিভিউ-সীমা) | QB.3 |
| QB.6 | দাম ও বিনামূল্য-নিয়ম (Super Admin), `QbPricingService` | QB.5 |
| QB.7 | শিক্ষকের প্রশ্নব্যাংক: খোঁজা/দেখা, কেনা (প্রতিষ্ঠানের ওয়ালেট), খরচের হিসাব | QB.6 |
| QB.8 | প্রশ্নপত্র-নির্মাতা + PDF + প্রধান শিক্ষকের দেখা | QB.7 |
| QB.9 | শিক্ষার্থী-লগইন ও পোর্টাল: প্রস্তুতি, কনসেপ্ট, bKash-কেনা | QB.7 |
| QB.10 | কুইজ ও কুইজ-প্যাকেজ (শিক্ষার্থী) | QB.9 |
| QB.11 | qbank থেকে আমদানি (`qb:import-from-qbank`) | QB.4 |
| QB.12+ | OMR, PDF/AI আমদানি, ডায়াগ্রাম-এডিটর, বোর্ড-প্রশ্ন বিশ্লেষণ | মালিকের অগ্রাধিকার |

প্রতিটি task-এ: Feature-পরীক্ষা (ভূমিকা-ম্যাট্রিক্স, tenant-বিচ্ছিন্নতা, উত্তর-ফাঁস-নয়, টাকা পয়সা-পর্যন্ত, দুজন একসাথে কিনলে একবার কাটা), React-পাতার পরীক্ষা, e2e smoke।

---

## ৮. খোলা সিদ্ধান্ত (মালিকের উত্তর লাগবে)
- **OD-qb-1** প্রতিষ্ঠানের প্রশ্নব্যাংক-খরচ SMS-এর **একই ওয়ালেট** থেকে (ধরে-নেওয়া), নাকি আলাদা ওয়ালেট?
- **OD-qb-2** "আংশিক বিনামূল্যে" মানে কী — প্রথম কয়েকটি আইটেম/পাতা বিনামূল্যে (ধরে-নেওয়া), নাকি দামে ছাড় (%), নাকি অন্য কিছু?
- **OD-qb-3** একবার কেনা প্রশ্ন **উত্তর দেখা ও প্রশ্নপত্রে ব্যবহার — দুটোই** খোলে (ধরে-নেওয়া), নাকি দুটোর আলাদা দাম?
- **OD-qb-4** শিক্ষার্থীর দাম শিক্ষকের দাম থেকে আলাদা হবে কি? কুইজ-প্যাকেজের মেয়াদ (যেমন ৩০ দিন) থাকবে কি?
- **OD-qb-5** শিক্ষক-প্রতি মাসিক খরচ-সীমা প্রতিষ্ঠান বসাতে পারবে কি?
- **OD-qb-6** qbank-এর ছাড়-সাবস্ক্রিপশন এখানে লাগবে কি (পরে)?
- **OD-qb-7** গণিত-এডিটরের জন্য `mathlive` প্যাকেজ (qbank-এ ব্যবহৃত) যোগের অনুমোদন।
- **OD-qb-8** লেখকেরা কি পারিশ্রমিক-হিসাব চান (কার লেখা কত প্রশ্ন বিক্রি হলো)? — হিসাব রাখা সহজ (`created_by`), পেমেন্ট-ব্যবস্থা নয়।
