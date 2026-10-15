# Staff, Salary & Payroll (Revision 10)

> **এই ফাইল বেতনের একমাত্র স্পেক।** আগের `docs/modules/hr-payroll.md`-এর বেতন-অংশ (একটি `salary` সংখ্যা, `salary_payments`) **বাতিল**; ছুটি-ধরন ও ছুটি-আবেদন সেখানে বহাল। হিসাবের নিয়মগুলো একটি Decimal reference-এ চালিয়ে **২৩টি কেসে মিলিয়েছি** (§১৬); PHP port পরীক্ষা করা হয়নি — `PayrollGoldenTest` একই সংখ্যা প্রমাণ করবে।
> **আইনি সীমা:** বেতন, কর, ভবিষ্যৎ তহবিল, বোনাস, বেতন কমানো — সংশ্লিষ্ট বাংলাদেশি আইন/বিধি আমি যাচাই করিনি। সিস্টেম নীতিগুলো *কনফিগারযোগ্য* রাখে, কোনো আইনি হার বা সীমা ধরে নেয় না; প্রকাশের আগে হিসাবরক্ষক/আইনজীবীর যাচাই (§১৭)।

Module key: `hr_payroll` (প্ল্যান-নিয়ন্ত্রিত; `docs/modules/subscription.md`)। ধরন: school · college · coaching (private_batch-এ নেই)।

## ০. কী বদলাল (সংক্ষেপে)
| আগে | এখন |
|---|---|
| `teachers.salary` + ৩টি allowance কলাম | **তারিখ-ভিত্তিক বেতন-কাঠামো** (`salary_structures`) + খোলা উপাদান (`salary_components`); `teachers.salary…` কেবল *বর্তমান কাঠামোর cache*, শুধু `SalaryStructureService` লেখে |
| শুধু শিক্ষক | শিক্ষক **ও অশিক্ষক কর্মচারী** (`staff_members`) |
| `salary_payments` (এক সারি/মাস) | `payroll_runs` + `payroll_items` (মাসিক/বোনাস/চূড়ান্ত নিষ্পত্তি), অনুমোদন-ধাপসহ |
| কোনো ইনক্রিমেন্ট নেই | ইনক্রিমেন্ট · ডিক্রিমেন্ট · পদোন্নতি · সংশোধন (`salary_revisions`), বছরের bulk ইনক্রিমেন্ট, backdate-এ স্বয়ংক্রিয় arrears |
| কোনো বোনাস নেই | বোনাস-স্কিম (ঈদ/উৎসব/কর্মদক্ষতা), যোগ্যতা ও আনুপাতিক নিয়ম |
| কোনো অগ্রিম/জরিমানা নেই | অগ্রিম/ঋণ + কিস্তিতে কর্তন, জরিমানা, ওভারটাইম/অতিরিক্ত-ক্লাস, arrears (`salary_adjustments`) |
| অনুপস্থিতি `user_id` দিয়ে খোঁজা (**ভুল**: `teacher_attendances` চলে `teacher_id`-তে) | `AttendanceSummary::forPayee(type, id, month)` |
| payroll ফলাফল বদলানো যেত | অনুমোদনের পর **অপরিবর্তনীয় snapshot**; সংশোধন = পরের মাসে নতুন লাইন (D32) |

---

## ১. অশিক্ষক কর্মচারী (`staff_members`)
`institution_id`, `user_id` (NULL সম্ভব), `employee_id` (`UNIQUE (institution_id, employee_id)`), `name`, `designation`, `department`, `phone`, `joining_date`, `leaving_date` (NULL), `photo`, `status` (`active|inactive|on_leave`), `deleted_at` (soft delete)।
- ফোন/ছবি/যোগদান-তারিখ ছাড়া অতিরিক্ত ব্যক্তিগত তথ্য (জাতীয় পরিচয়পত্র ইত্যাদি) **সংগ্রহ করা হয় না** (ন্যূনতম-সংগ্রহ নীতি, `docs/legal/privacy-and-consent.md`)।
- **লগইন:** স্কিমায় `staff` role নেই (`users.role` ENUM)। অর্থাৎ **কর্মচারীর স্বয়ংসেবা (payslip নিজে দেখা) এই সংস্করণে নেই** — Admin/Accountant প্রিন্ট দেয় বা SMS-এ "payslip প্রস্তুত" জানায়। `staff` role চাইলে `users.role`, `RoleMiddleware`, মেনু, test-এ একসাথে পরিবর্তন — আলাদা সিদ্ধান্ত (§১৭)। যে কর্মচারী `accountant` role-এ আছে তার `user_id` সংযুক্ত করা যায়।
- **উপস্থিতি:** `staff_attendances` (`teacher_attendances`-এর অনুরূপ, `UNIQUE (institution_id, staff_id, date)`)। Admin/Accountant দৈনিক তোলে; device থাকলে (`docs/modules/attendance-devices.md`) স্বয়ংক্রিয়।
- **ছুটি:** `leave_applications` এখন `user_id` অথবা `staff_id` (ঠিক একটি; service-এ যাচাই)। ছুটি-ধরন (`leave_types.is_paid`) শিক্ষক-কর্মচারী উভয়ে এক।

---

## ২. বেতন-কাঠামো
### ২.১ উপাদান (`salary_components`)
প্রতিষ্ঠানের নিজস্ব তালিকা। সিস্টেম-বীজ: `house_rent` (মূল বেতনের %), `medical`, `transport` (স্থির) — মুছা যায় না, বন্ধ করা যায়।
| কলাম | অর্থ |
|---|---|
| `code` | স্থির নাম (`UNIQUE (institution_id, code)`), যেমন `mobile`, `pf_employee` |
| `name` (JSON `{bn,en,ar}`) | slip-এ প্রাপকের ভাষায় |
| `type` | `earning` · `deduction` |
| `calc` (VARCHAR) | `fixed` · `percent_basic` (সম্প্রসারণযোগ্য) |
| `taxable` | কর-ভিত্তিতে ধরা হবে কি |
| `is_pf` | ভবিষ্যৎ তহবিল-ভিত্তি/কর্তন (§১০) |
| `sort_order`, `is_active` | |

### ২.২ কাঠামো (`salary_structures`) — তারিখ-ভিত্তিক
একজন payee-র (`payee_type` ∈ `teacher|staff`, `payee_id`) প্রতিটি বেতন-পর্ব এক সারি: `basic`, `gross` (সেই কাঠামোর হিসাবকৃত মোট), `effective_from`, `effective_to` (NULL = চলমান), `designation`, `grade`, `revision_id`। `UNIQUE (institution_id, payee_type, payee_id, effective_from)`। উপাদান-মান `salary_structure_lines` (`structure_id`, `component_id`, `mode` ∈ `fixed|percent_basic`, `value`)।
- **অপরিবর্তনীয় ইতিহাস:** পুরনো কাঠামো সম্পাদনা নয়; পরিবর্তন = নতুন কাঠামো + পুরনোটির `effective_to = নতুন.effective_from − ১ দিন`। কোনো দিন দুই কাঠামো নয় (service-এ overlap-যাচাই)।
- **Cache:** `teachers.salary/house_rent/medical_allowance/transport_allowance` ও (staff-এর অনুরূপ কলাম) সক্রিয় কাঠামো থেকে লেখা হয়, শুধু `SalaryStructureService::apply()` দিয়ে; `$fillable`-এ নেই (D4-র নীতি)।
- প্রথম কাঠামো = `revision.kind = initial` (শিক্ষক/কর্মচারী যোগ করার ধাপের অংশ)।

### ২.৩ পেমেন্ট-অ্যাকাউন্ট (`salary_pay_accounts`)
payee-প্রতি পদ্ধতি-ভিত্তিক সারি: `method` (`cash|bank|bkash|nagad|rocket|cheque`), `account_name`, `account_number` (**`encrypted` cast, কখনো API/লগে নয়**; ইউআই-তে শেষ ৪ অঙ্ক), `bank_name`, `branch_name`, `routing_number`, `is_default`। শুধু Admin/Accountant লেখে/দেখে (মাস্ক সহ)।

---

## ৩. ইনক্রিমেন্ট, ডিক্রিমেন্ট, পদোন্নতি, সংশোধন (`salary_revisions`)
| `kind` | কখন |
|---|---|
| `initial` | প্রথম কাঠামো |
| `increment` | বাৎসরিক/যোগ্যতা-ভিত্তিক বৃদ্ধি |
| `decrement` | শাস্তিমূলক/আর্থিক কারণে হ্রাস |
| `promotion` | পদ বদল + নতুন কাঠামো |
| `correction` | আগের ভুল সংশোধন |
**ক্ষেত্র:** `payee`, `change_mode` (`percent|amount|set`), `change_value`, `target` (`basic` বা `component:<code>`), `old_basic/new_basic`, `old_gross/new_gross`, `effective_from`, `reason`, `status` (`proposed|approved|rejected|applied|cancelled`), `proposed_by`, `approved_by`, `letter_no`, `arrears_policy` (`auto|none`), `batch_id`।

### ৩.১ প্রবাহ
```
প্রস্তাব (Accountant/Admin)  →  পূর্বরূপ: পুরনো/নতুন গ্রস, মাসিক পার্থক্য, backdate হলে arrears-হিসাব
        →  অনুমোদন (Admin; maker-checker §৭.২)  →  প্রয়োগ: নতুন salary_structure + পুরনোটি বন্ধ + cache + letter_no
        →  backdate হলে arrears স্বয়ংক্রিয় (§৩.৩)  →  payee-কে নোটিফিকেশন (in-app; SMS-এ অঙ্ক নয়)
```
- **ডিক্রিমেন্ট-বিশেষ:** `reason` বাধ্যতামূলক; অনুমোদনের আগে payee-কে জানানো ও (সেটিং `payroll.decrement_requires_acknowledgement`, ডিফল্ট `true`) payee-র লিখিত স্বীকৃতির আপলোড (স্ক্যান) না হলে অনুমোদন আটকায়; ন্যূনতম বেতন-সীমা `payroll.min_basic` (ঐচ্ছিক) নিচে নামানো যায় না। **একতরফা বেতন-হ্রাসের আইনি সীমা আমি যাচাই করিনি** — প্রতিষ্ঠানের আইনজীবীর সাথে মিলিয়ে নিন; সেটিংগুলো সেই সুরক্ষার জন্য।
- **ভবিষ্যৎ-তারিখ:** `effective_from` ভবিষ্যতে হলে `approved` থাকে, তারিখ আসলে scheduler (`payroll:apply-revisions`, দৈনিক, `Tenancy::each`) প্রয়োগ করে।

### ৩.২ বাৎসরিক bulk ইনক্রিমেন্ট (`IncrementBatchService`)
`POST /hr/increment-batches/preview` `{ percent | amount, round_to (1|10|50|100), effective_from, min_months_since_last (ডিফল্ট ১২), payee_types[], exclude[] }` → যোগ্য তালিকা (শেষ কাঠামো `min_months_since_last` মাসের পুরনো, সক্রিয়, ছুটি-বিনা-বেতনে নয়), প্রতিজনের নতুন মূল বেতন ও গ্রস। "প্রস্তাব তৈরি" একই `batch_id`-র `proposed` revision বানায়; Admin সব বা একে একে অনুমোদন/বাতিল/পরিমাণ সংশোধন করে। `percent_basic` উপাদান নিজে বাড়ে; `fixed` উপাদান বদলায় না (লক্ষ্য `component:<code>` না দিলে)।

### ৩.৩ Arrears (backdate)
অনুমোদিত revision-এর `effective_from` কোনো **ইতিমধ্যে paid** payroll-মাসে পড়লে, প্রতিটি পরিশোধিত মাসের জন্য `(নতুন গ্রস − যে গ্রস দেওয়া হয়েছিল) × (নতুন-কাঠামোর দিন ÷ মাসের দিন)` যোগ করে একটি `salary_adjustments` (`kind=arrear`, `direction=earning`, পরবর্তী *খোলা* মাসে) তৈরি হয়। মাসটি আংশিকভাবে নতুন হলে আনুপাতিক। `payroll.max_backdate_months` (ডিফল্ট ১২) এর বেশি পিছনে নয়। ডিক্রিমেন্ট backdate হলে arrears ঋণাত্মক হয় → **`recovery` (deduction)**, এবং `payroll.allow_backdated_decrement` (ডিফল্ট `false`) না হলে নিষিদ্ধ। *(ফিক্সচার: §১৬ #৮–৯।)*

### ৩.৪ পত্র
প্রতিটি `applied` revision-এর জন্য পত্র PDF (ইনক্রিমেন্ট/ডিক্রিমেন্ট/পদোন্নতি): প্রতিষ্ঠানের লোগো-নাম, পত্র নম্বর `REV-{YYYY}-{seq}` (`nextLetterNo()`: transaction + institution row lock, রসিদের মতো), payee, পুরনো→নতুন (মূল/গ্রস), কার্যকর তারিখ, কারণ (ডিক্রিমেন্টে বাধ্যতামূলক), স্বাক্ষর-ঘর। payee-র ভাষায় (`docs/I18N.md`; PDF engine শর্ত §৮)।

---

## ৪. বোনাস
### ৪.১ স্কিম (`bonus_schemes`)
| ক্ষেত্র | অর্থ |
|---|---|
| `name`, `kind` | `festival` (ঈদ-উল-ফিতর/আযহা/পহেলা বৈশাখ …), `performance`, `annual`, `other` |
| `pay_month` | কোন payroll-মাসে (সাধারণত আলাদা `bonus` run) |
| `basis`, `value` | `basic` বা `gross` এর % **অথবা** `fixed` অঙ্ক |
| `min_service_months` | এর কম চাকরি = অযোগ্য |
| `prorate_below_months` | এর কম হলে `সেবা-মাস ÷ এই সংখ্যা` আনুপাতিক |
| `applies_to` (JSON) | `payee_types`, `designations[]`, `exclude[]` (নির্দিষ্ট payee বাদ) |
| `max_amount`, `taxable` | সীমা ও করযোগ্যতা |
| `status` | `draft → applied → cancelled` |
- **প্রয়োগ:** `POST /hr/bonus-schemes/{id}/preview` (যোগ্য তালিকা, প্রতিজনের অঙ্ক, বাদ-কারণ) → `apply` প্রতি payee-র জন্য `salary_adjustments` (`kind=bonus`, `scheme_id`) তৈরি করে (idempotent: একই scheme+payee দুবার নয়)।
- সেবা-মাস = `joining_date` থেকে `pay_month`-এর শেষ পর্যন্ত পূর্ণ মাস (সংজ্ঞা `SalaryCalendar::serviceMonths()`)। *(ফিক্সচার §১৬ #১০–১৩।)*
- **ঈদ-বোনাস বাধ্যতামূলক কি না, কত — আমি যাচাই করিনি।** সিস্টেম শুধু আপনার দেওয়া নিয়ম প্রয়োগ করে।
### ৪.২ হাতে-দেওয়া বোনাস
`salary_adjustments` (`kind=bonus`) সরাসরি: কারণ বাধ্যতামূলক, ঐচ্ছিক সংযুক্তি; অনুমোদন-সীমা `payroll.adjustment_approval_threshold` (এর উপরে Admin)।

---

## ৫. অন্যান্য সমন্বয় (`salary_adjustments`)
এককালীন বা নির্দিষ্ট মাসের লাইন; payroll হিসাবে স্বয়ংক্রিয় ঢোকে।
| `kind` | `direction` | নোট |
|---|---|---|
| `bonus` | earning | §৪ |
| `allowance` | earning | অস্থায়ী ভাতা (যেমন ভ্রমণ) |
| `overtime` | earning | ঘণ্টা × হার (হাতে) |
| `extra_class` | earning | `substitutions`-এর সংখ্যা × `payroll.extra_class_rate`; মাসের শুরুতে *প্রস্তাব* (`GET /hr/adjustments/suggest-extra-class?month=`), Admin অনুমোদন করলে তৈরি — স্বয়ংক্রিয় টাকা নয় |
| `arrear` | earning | §৩.৩ |
| `fine` | deduction | কারণ বাধ্যতামূলক; `payroll.max_fine_percent` (ঐচ্ছিক) এর বেশি নয় |
| `recovery` | deduction | ভুল-অতিরিক্ত-প্রদান ফেরত, ঋণাত্মক arrears |
| `other` | উভয় | |
`status`: `pending → approved → applied` (payroll-এ ঢুকলে `payroll_item_id` বসে), `cancelled`। `applied` লাইন সম্পাদনা নয়; ভুল হলে উল্টো লাইন (D32)। **ছুটির দিনের কাজ/ওভারটাইমের আইনি হার** আমি ধরিনি — হার আপনি দেন।

---

## ৬. অগ্রিম ও ঋণ (`salary_advances`)
`payee`, `amount`, `reason`, `installments`, `installment_amount` (ডিফল্ট `amount ÷ installments`, শেষ কিস্তি অবশিষ্ট), `recover_from_month`, `recovered`, `status` (`requested → approved → active → closed` | `rejected` | `written_off`), `payment_method`, `disbursed_at`।
- **প্রদান:** অনুমোদনের পর Admin/Accountant "অগ্রিম দিন" → `expenses` সারি (`source=advance`) → `active`।
- **কিস্তি-কর্তন:** প্রতি regular payroll-এ স্বয়ংক্রিয় `advance_recovery` লাইন। **কর্তন-সীমা:** মোট কর্তনের পর নেট `payroll.min_net_after_recovery` (ডিফল্ট ০) এর নিচে নামলে কিস্তি কমে যায়, বাকি `balance`-এ থেকে যায় ও পরের মাসে যোগ (ফিক্সচার #১১–১২)। payee-র অনুরোধে কিস্তি-ছাড় (skip) — Admin অনুমোদনসহ।
- `closed` যখন `recovered ≥ amount`; চাকরি ছাড়লে বাকি §১১-র চূড়ান্ত নিষ্পত্তিতে কাটে বা `written_off` (কারণসহ Admin)।
- সীমা: একসাথে সক্রিয় অগ্রিম সংখ্যা `payroll.max_active_advances` (ডিফল্ট ১); মোট ≤ `payroll.max_advance_months` × গ্রস (ডিফল্ট ৩)।

---

## ৭. Payroll run
### ৭.১ ধরন ও জীবনচক্র
`payroll_runs`: `month`, `kind` (`regular|bonus|final|supplementary`), `label` (একই মাসে একাধিক bonus run আলাদা করতে), `status`, `settings_snapshot` (JSON — হিসাবে ব্যবহৃত সেটিং, যাতে পরে পুনরুৎপাদনযোগ্য), মোট (`total_gross`, `total_deductions`, `total_net`, `payees_count`), `prepared_by`, `reviewed_by`, `approved_by`, `approved_at`, `paid_at`, `cancelled_reason`। `UNIQUE (institution_id, month, kind, label)`।
```
draft ──generate/recompute──▶ draft ──review──▶ reviewed ──approve──▶ approved ──pay (per item / bulk)──▶ paid
   │                                                 └── reject ▶ draft            └── cancel (শুধু কেউ paid না হলে)
   └── cancel
```
- `draft`: যতবার খুশি recompute (idempotent: `payroll_items` upsert)। `approved`: **ফ্রিজ** — `payroll_items.breakdown` snapshot অপরিবর্তনীয়; আর recompute নয়।
- **ভুল পরে ধরা পড়লে:** `approved/paid` item সম্পাদনা নয়; পরের মাসে `salary_adjustments` (arrear/recovery) বা `supplementary` run। (D32)
- `final` run: §১১। `bonus` run: শুধু বোনাস/সমন্বয়, উপস্থিতি-কর্তন নেই।

### ৭.২ Maker–checker
`payroll.require_approval` (ডিফল্ট `true`)। প্রস্তুতকারী নিজের run/revision/adjustment নিজে অনুমোদন করতে পারে না। ব্যতিক্রম (`payroll.allow_self_approval`): `never` · `if_sole_approver` (**ডিফল্ট** — প্রতিষ্ঠানে একজন-মাত্র Admin থাকলে অনুমোদন সম্ভব, `audit_logs`-এ `self_approved=true` চিহ্ন সহ) · `always`। ছোট কোচিং/একজন-Admin প্রতিষ্ঠান যাতে আটকে না যায়।

### ৭.৩ গণনা — `PayrollCalculator::item(payee, month, settings)`
ইনপুট: সেই মাসে সক্রিয় কাঠামো(সমূহ), যোগদান/ত্যাগের তারিখ, উপস্থিতি, অনুমোদিত ছুটি, `applied`-যোগ্য সমন্বয়, সক্রিয় অগ্রিম। ধাপ:
1. **সক্রিয় দিন:** `max(মাসের শুরু, joining_date)` থেকে `min(মাসের শেষ, leaving_date)`।
2. **কাঠামো-ভাগ ও আনুপাতিকতা** *(ক্যালেন্ডার-দিনে, সর্বদা)*: প্রতিটি কাঠামো-পর্বের জন্য `উপাদান × (পর্বের দিন ÷ মাসের দিন)`; তাই মাঝ-মাসের ইনক্রিমেন্ট ও যোগদান/ত্যাগ সঠিক (ফিক্সচার #৫–৭)।
3. **উপাদান:** `fixed` অথবা `percent_basic` (মূল বেতনের %)।
4. **অনুপস্থিতি/LWP/বিলম্ব-কর্তন:** `দৈনিক হার = কর্তন-ভিত্তি (basic|gross) ÷ basis_days`; `unpaid_days = absent + lwp + (late_count ÷ lates_per_day)` (পূর্ণসংখ্যা-ভাগ; `lates_per_day = 0` = বন্ধ); কর্তন = `দৈনিক হার × unpaid_days`। `basis_days`: `calendar` (মাসের দিন) · `fixed_30` · `working` (কর্মদিবস)।
   - **জেনে রাখুন:** `calendar` ভিত্তিতে একই এক দিনের অনুপস্থিতির কর্তন মাসভেদে আলাদা (৩০,৫০০ গ্রসে অক্টোবরে ৯৮৩.৮৭, ৩০-দিনের মাসে ১,০১৬.৬৭)। সমান কর্তন চাইলে `fixed_30` (ফিক্সচার #২–৩)।
   - উপস্থিতি-উৎস: শিক্ষকের `teacher_attendances`, কর্মচারীর `staff_attendances` (দুটিই payee-id দিয়ে — `user_id` নয়); ছুটি: `leave_applications` (approved; `is_paid = false` → `lwp_days`)।
5. **সমন্বয়:** ঐ মাসের `approved` `salary_adjustments` (earning/deduction) লাইন হিসেবে।
6. **PF** (§১০) ও **কর** (§১০) কর্তন।
7. **অগ্রিম-কিস্তি:** §৬; নেট কখনো `min_net_after_recovery`-এর নিচে নামে না।
8. **মোট:** `total_earnings`, `total_deductions`, `net`; প্রতি লাইন ২-দশমিকে `ROUND_HALF_UP`। `payroll.rounding = nearest_1` হলে নেট নিকটতম টাকায় ও পার্থক্য `rounding` লাইনে।
9. **নেট < ০ বা অসম্পূর্ণ তথ্য** (উপস্থিতি-ফাঁকা দিন, পেমেন্ট-অ্যাকাউন্ট নেই) → item `held` + কারণ; পরিশোধ-আগে Admin সমাধান করে।
`breakdown` (JSON): `[{ "code", "name":{bn,en,ar}, "type":"earning|deduction", "amount", "source":"structure|adjustment|advance|attendance|pf|tax|rounding", "ref_id" }]` — slip ও রিপোর্টের একমাত্র উৎস।

### ৭.৪ Run তৈরি
`POST /hr/payroll-runs { month, kind, label? }` → `GeneratePayrollRun` job (`TenantAwareJob`, D25): সক্রিয় payee নির্বাচন, `PayrollCalculator` প্রতিজনে, `payroll_items` upsert, মোট। আগে **প্রি-ফ্লাইট তালিকা** (blocking/warning): উপস্থিতি অসম্পূর্ণ দিন, কাঠামোহীন payee, অনুমোদনহীন সমন্বয়, পেমেন্ট-অ্যাকাউন্টহীন, `held`।
`teacher_payouts` (কোচিং, ক্লাসপ্রতি/শতাংশ) সমন্বয়: `approved` payout `payroll_item_id`-তে সংযুক্ত করা যায় (একই slip-এ "ক্লাস-ভিত্তিক পেমেন্ট" লাইন); সংযুক্ত হলে আলাদা `pay` নিষিদ্ধ (দ্বিগুণ-পরিশোধ রোধ)।

---

## ৮. পরিশোধ ও disbursement
- **পদ্ধতি:** item-প্রতি (`payment_method`): ডিফল্ট payee-র `salary_pay_accounts.is_default`।
- **এক-এক করে বা bulk** "পরিশোধ করুন" (কেবল `approved` run-এ): `paid_reference`, `paid_at`, `paid_by`, status `paid`; আংশিক পরিশোধ বৈধ (বাকিরা `ready`)।
- **Disbursement তালিকা:** `GET /hr/payroll-runs/{id}/disbursement.csv` — নির্ধারিত সাধারণ কলাম (payee, পদ্ধতি, অ্যাকাউন্ট-নাম, অ্যাকাউন্ট নং, ব্যাংক/শাখা, মোবাইল, অঙ্ক, রেফারেন্স)। **কোনো নির্দিষ্ট ব্যাংকের upload-ফরম্যাট দাবি করা হয়নি**; আপনার ব্যাংক যে ফরম্যাট চায় সেটি জানালে আলাদা exporter। অ্যাকাউন্ট-নং CSV-তে পূর্ণ (ফাইলটি ডাউনলোড করে ব্যাংকে যায়) — তাই ডাউনলোড শুধু Admin/Accountant, প্রতিটি `audit_logs`-এ, ফাইল ২৪ ঘণ্টার signed URL।
- **হিসাবে প্রভাব:** পরিশোধে `expenses` সারি (`source=payroll`, `payroll_run_id`, `payment_method` অনুযায়ী) — run ও পদ্ধতি-প্রতি একটি সারাংশ-সারি (`category = বেতন`); নগদ হলে ক্যাশবুকের (`docs/modules/finance-advanced.md`) *আউট*। অগ্রিম-প্রদান আলাদা (`source=advance`)।
- **ব্যর্থ পরিশোধ:** ব্যাংক ফেরত দিলে item `failed` → আবার পরিশোধযোগ্য (নতুন `paid_reference`); `expenses` সংশোধন উল্টো সারিতে।

---

## ৯. Payslip
- **নম্বর:** `PS-{YYYY}-{MM}-{seq}` (`payroll_items.slip_no`, `UNIQUE (institution_id, slip_no)`; run অনুমোদনের সময় বরাদ্দ)।
- **বিষয়:** প্রতিষ্ঠান-হেডার (লোগো/নাম), payee, পদ, মাস, উপাদান-অনুযায়ী আয় ও কর্তন (breakdown, payee-র ভাষায়), মোট/নেট (অক্ষরে ঐচ্ছিক), কর্ম-দিন/অনুপস্থিতি/ছুটি, YTD (এ বছরের মোট আয়/কর), অগ্রিমের অবশিষ্ট, পরিশোধ-পদ্ধতি; `bonus` run হলে আলাদা শিরোনাম।
- **বিতরণ:** শিক্ষক নিজের পোর্টালে (`/teacher/salary`); কর্মচারীর জন্য প্রিন্ট; "payslip প্রস্তুত" in-app/SMS (**অঙ্ক নেই**)।
- PDF: engine শর্ত (বাংলা/আরবি) `docs/I18N.md` §৮।

---

## ১০. ভবিষ্যৎ তহবিল (PF) ও কর — ঐচ্ছিক, সীমিত
### PF
`settings.payroll.pf = { enabled, employee_percent, employer_percent, base: "basic"|"gross", interest_percent? }`। চালু হলে: কর্মচারী-অংশ একটি কর্তন-লাইন (`pf_employee`); নিয়োগকর্তা-অংশ payee থেকে কাটে না, শুধু `provident_fund_entries` (`kind=employer`)-এ জমা ও প্রতিষ্ঠানের খরচ-রিপোর্টে। লেজার: `provident_fund_entries` (`employee|employer|withdrawal|interest|adjustment`); স্টেটমেন্ট PDF; চূড়ান্ত নিষ্পত্তিতে উত্তোলন। **এটি হিসাব-খাতা মাত্র — তহবিল রাখা/বিনিয়োগ/ট্রাস্ট-বিধি বা সুদের আইনি নিয়ম আমি ধরিনি।**
### কর (উৎসে কর্তন)
`settings.payroll.tax`: `mode` ∈ `none` (ডিফল্ট) · `fixed_percent` · `slab`। `slab` = প্রতিষ্ঠান/হিসাবরক্ষকের দেওয়া ধাপ-তালিকা `[{up_to, rate}, …]` + বার্ষিক ছাড়-সীমা; সূত্র (সরলীকৃত): `বার্ষিক করযোগ্য ≈ (করযোগ্য মাসিক আয়) × ১২`, ধাপ অনুযায়ী বার্ষিক কর, `÷ ১২`। **এটি সরলীকরণ** — বিনিয়োগ-রিবেট, বছরের মাঝামাঝি আয়-পরিবর্তন, একাধিক উৎস ইত্যাদি ধরে না; বাংলাদেশের বর্তমান কর-বিধি আমি যাচাই করিনি। প্রকৃত কর-হিসাব ও রিটার্ন হিসাবরক্ষকের দায়; সিস্টেম একটি মাসিক কর্তন-লাইন ও বার্ষিক কর্তন-সারাংশ দেয়, tax return তৈরি করে না।

---

## ১১. চূড়ান্ত নিষ্পত্তি (`kind = final`)
চাকরি-ত্যাগে (`leaving_date` বসালে প্রস্তাব): ত্যাগ-মাসের আনুপাতিক বেতন (§৭.৩) + অনুমোদিত বকেয়া সমন্বয়/arrears + বোনাস-আনুপাতিক (স্কিম অনুযায়ী) − অগ্রিমের অবশিষ্ট − PF উত্তোলন (এ যোগ) − জরিমানা। অব্যবহৃত ছুটির নগদায়ন বা গ্র্যাচুইটি **এই সংস্করণে নেই** (নিয়ম ও আইন প্রতিষ্ঠানভেদে আলাদা; `salary_adjustments(kind=other)` হাতে যোগ করা যায়)। অনুমোদনের পর payee `inactive`, কাঠামো বন্ধ।

---

## ১২. অ্যাক্সেস, নিরাপত্তা, গোপনীয়তা
| কে | কী |
|---|---|
| Admin | সব; অনুমোদন; পরিশোধ |
| Accountant | সব *প্রস্তুতি* (কাঠামো প্রস্তাব, run, সমন্বয়, পরিশোধ); নিজের প্রস্তুত করা অনুমোদন নয় (§৭.২) |
| Teacher | **শুধু নিজের** slip, কাঠামো-ইতিহাস, অগ্রিম, YTD |
| Student/Parent | কিছুই নয় |
| **Super Admin** | **কিছুই নয়** — বেতন-ডেটা প্ল্যাটফর্মের আওতার বাইরে। Impersonation-এও (`docs/modules/platform-ops.md`) payroll route 403 `sensitive_scope`; Super Admin-এর `/super/*`-এ payroll টেবিল-কোয়েরি নেই; backup-এ থাকে (এনক্রিপ্টেড ডিস্ক) |
- বেতন-সংখ্যা API-তে *authorization policy* ছাড়া কোনো resource-এ থাকে না (`SalaryPolicy`); তালিকা-endpoint-এ অন্য payee-র বেতন Teacher-কে 403।
- লগ/Sentry-তে বেতন-অঙ্ক বা অ্যাকাউন্ট-নং নয়; `audit_logs`-এ পরিবর্তনের *ঘটনা* আছে, মান নয় (কেবল revision/adjustment-এর কারণ ও আইডি)।
- রপ্তানি (Excel/CSV/PDF) ডাউনলোড `audit_logs`-এ; payroll Excel পাসওয়ার্ড-সুরক্ষিত বিকল্প ঐচ্ছিক (ভবিষ্যৎ)।
- `salary_pay_accounts.account_number` ও PF-ডেটা tenant-purge ও anonymize-এ আচ্ছাদিত (`docs/legal/privacy-and-consent.md`)।

## ১৩. সেটিংস (`institutions.settings.payroll`)
```json
{
  "basis_days": "calendar",              "deduction_base": "gross",        "absent_policy": "unpaid",
  "late_policy": { "lates_per_day": 0 }, "min_net_after_recovery": 0,      "rounding": "none",
  "require_approval": true,              "allow_self_approval": "if_sole_approver",
  "max_backdate_months": 12,             "allow_backdated_decrement": false,
  "decrement_requires_acknowledgement": true, "min_basic": null,
  "adjustment_approval_threshold": null, "max_fine_percent": null,
  "extra_class_rate": 0,                 "max_active_advances": 1,         "max_advance_months": 3,
  "pf": { "enabled": false, "employee_percent": 0, "employer_percent": 0, "base": "basic" },
  "tax": { "mode": "none", "percent": 0, "slabs": [], "annual_exemption": 0 }
}
```
সব ডিফল্ট সংরক্ষণশীল (কর্তন কম, অনুমোদন বেশি)। প্রতিটি পরিবর্তন `audit_logs`-এ; `payroll_runs.settings_snapshot` রান-কালের মান ধরে রাখে।

## ১৪. রিপোর্ট
মাসিক payroll register (PDF/Excel) · বিভাগ/পদ অনুযায়ী · disbursement তালিকা (পদ্ধতি-অনুযায়ী) · বোনাস রেজিস্টার · ইনক্রিমেন্ট/ডিক্রিমেন্ট ইতিহাস · অগ্রিম-লেজার ও অবশিষ্ট · payee-র YTD আয়-বিবরণী · PF স্টেটমেন্ট · কর-কর্তন সারাংশ (মাসিক/বার্ষিক) · মাসিক বেতন-ব্যয় প্রবণতা (চার্ট) · `held` তালিকা। সব `docs/modules/pdf-reports.md`-এর engine-শর্ত ও locale অনুযায়ী।

## ১৫. Endpoint ও পাতা
```
# কাঠামো ও উপাদান
GET|POST|PUT /hr/salary-components                    GET /hr/people/{type}/{id}/salary      (কাঠামো-ইতিহাস)
GET|POST /hr/staff    PUT|DELETE /hr/staff/{id}       GET|POST /hr/staff-attendance
GET|PUT  /hr/people/{type}/{id}/pay-accounts
# ইনক্রিমেন্ট ইত্যাদি
GET|POST /hr/revisions          POST /hr/revisions/{id}/approve|reject|cancel       GET /hr/revisions/{id}/letter.pdf
POST /hr/increment-batches/preview   POST /hr/increment-batches    (→ proposed revisions)
# বোনাস, সমন্বয়, অগ্রিম
GET|POST /hr/bonus-schemes      POST /hr/bonus-schemes/{id}/preview|apply|cancel
GET|POST /hr/adjustments        POST /hr/adjustments/{id}/approve|cancel     GET /hr/adjustments/suggest-extra-class?month=
GET|POST /hr/advances           POST /hr/advances/{id}/approve|reject|disburse|skip-installment|write-off
# Payroll
GET|POST /hr/payroll-runs       GET /hr/payroll-runs/{id}       POST /hr/payroll-runs/{id}/recompute|review|approve|reject|cancel
POST /hr/payroll-runs/{id}/pay  { item_ids?, method?, reference? }            PATCH /hr/payroll-items/{id} { hold|release, reason }
GET  /hr/payroll-runs/{id}/disbursement.csv    /register.xlsx    /register.pdf
GET  /hr/payroll-items/{id}/slip.pdf            POST /hr/final-settlement/{type}/{id}/start
GET  /hr/reports/{name}                          GET|POST /hr/pf/entries     GET /hr/pf/{type}/{id}/statement.pdf
# শিক্ষক (নিজের)
GET /teacher/salary   /teacher/salary/slips   /teacher/salary/slips/{id}.pdf   /teacher/salary/advances   /teacher/salary/history
```
Admin পাতা (মেনু `hr_payroll` গ্রুপ, `docs/AUTHORIZATION.md`): `hr/staff` · `hr/salary-components` · `hr/people/:type/:id` · `hr/revisions` · `hr/increments` (bulk) · `hr/bonus` · `hr/adjustments` · `hr/advances` · `hr/payroll` · `hr/payroll/:id` · `hr/pf` · `hr/reports`। Accountant: একই ( `/accountant/…` প্রতিচ্ছায়া)। Teacher: `/teacher/salary`।

---

## ১৬. Golden fixtures — Decimal reference-এ যাচাইকৃত (`PayrollGoldenTest`)
কাঠামো: মূল ২০,০০০; `house_rent` ৪০% = ৮,০০০; `medical` ১,৫০০; `transport` ১,০০০ ⇒ **গ্রস ৩০,৫০০**।
| # | পরিস্থিতি | প্রত্যাশিত |
|---|---|---|
| 1 | সম্পূর্ণ মাস, কর্তন নেই | গ্রস = নেট = ৩০,৫০০.০০ |
| 2 | অক্টোবর (৩১ দিন), অনুপস্থিত ২, ভিত্তি `gross`, `calendar` | দৈনিক ৯৮৩.৮৭; কর্তন ১,৯৬৭.৭৪; নেট ২৮,৫৩২.২৬ |
| 3 | অনুপস্থিত ২, ভিত্তি `basic`, `fixed_30` | কর্তন ১,৩৩৩.৩৩ |
| 4 | বিলম্ব ৭, `lates_per_day = 3` | unpaid_days = ২ |
| 5 | সেপ্টেম্বর (৩০ দিন): মূল ২০,০০০→২২,০০০ কার্যকর ১৬ সেপ্টে | ১৫ দিন ৩০,৫০০ + ১৫ দিন ৩৩,৩০০ ⇒ গ্রস **৩১,৯০০.০০** (নতুন গ্রস: ২২,০০০+৮,৮০০+১,৫০০+১,০০০ = ৩৩,৩০০) |
| 6 | যোগদান ১১ সেপ্টে (২০/৩০ দিন) | ২০,৩৩৩.৩৩ |
| 7 | ত্যাগ ১০ সেপ্টে (১০/৩০) | ১০,১৬৬.৬৭ |
| 8 | arrears: ইনক্রিমেন্ট ১ আগস্ট, আগস্ট-সেপ্টেম্বর paid (৩০,৫০০) | (৩৩,৩০০−৩০,৫০০)=২,৮০০ × ২ = **৫,৬০০.০০** |
| 9 | arrears: কার্যকর ১৬ আগস্ট (আগস্টে ১৬/৩১ দিন) + সেপ্টেম্বর পূর্ণ | ২,৮০০×১৬/৩১ + ২,৮০০ = **৪,২৪৫.১৬** |
| 10 | বোনাস: মূল বেতনের ১০০%, সেবা ৮ মাস, `prorate_below=12` | **১৩,৩৩৩.৩৩** |
| 11 | বোনাস: সেবা ১৪ মাস | ২০,০০০.০০ |
| 12 | বোনাস: `min_service_months=3`, সেবা ২ | ০ (অযোগ্য) |
| 13 | বোনাস: `max_amount=15,000` | ১৫,০০০.০০ |
| 14 | অগ্রিম-কিস্তি ৫,০০০ | কাটা ৫,০০০; নেট ২৫,৫০০.০০ |
| 15 | অনুপস্থিত ২৮ দিন + কিস্তি ৫,০০০, `min_net=0` | নেট ≥ ০; কাটা ≤ কর্তন-পরবর্তী নেট |
| 16 | PF ১০% মূল বেতনের + বোনাস ২০,০০০ | PF ২,০০০.০০; নেট ৪৮,৫০০.০০ |
| 17 | ডিক্রিমেন্ট ২২,০০০→২০,০০০ কার্যকর ১ অক্টো | অক্টোবর পূর্ণ মাস নতুনে ⇒ ৩০,৫০০.০০ |
(সব সংখ্যা Decimal `ROUND_HALF_UP`, ২ দশমিক। Reference ২৩ assertion পাস; PHP port এই সারণির সংখ্যা মেলাতে বাধ্য — মেলে না হলে PHP ভুল, সারণি নয়, যতক্ষণ না reference-সহ প্রমাণ।)

## ১৭. পরীক্ষা, Done When, মালিকের সিদ্ধান্ত
| Test | Asserts |
|---|---|
| `PayrollGoldenTest` | §১৬-র ১৭টি সারি |
| `PayrollProrationTest` | যোগদান/ত্যাগ/কাঠামো-বদল একই মাসে একসাথে; ২৮/২৯/৩০/৩১-দিনের মাস |
| `SalaryStructureTest` | overlap নিষিদ্ধ; পুরনো সারি অপরিবর্তনীয়; cache শুধু service লেখে (`$fillable` পরীক্ষা) |
| `RevisionLifecycleTest` | proposed→approved→applied; ভবিষ্যৎ-তারিখ scheduler; ডিক্রিমেন্ট কারণ+স্বীকৃতি ছাড়া 422; `min_basic`; পত্র নম্বর অনন্য/atomic |
| `IncrementBatchTest` | যোগ্যতা (১২ মাস); `round_to`; `fixed` উপাদান অপরিবর্তিত; বাদ-তালিকা; batch অনুমোদন |
| `ArrearsTest` | §১৬ #৮–৯; `max_backdate_months`; backdated decrement ডিফল্টে নিষিদ্ধ |
| `BonusSchemeTest` | যোগ্যতা, আনুপাতিক, cap, `exclude`, idempotent apply, আলাদা bonus run |
| `AdvanceRecoveryTest` | কিস্তি-সীমা, ব্যালেন্স ক্যারি, skip, write-off, সক্রিয়-সংখ্যা সীমা |
| `MakerCheckerTest` | নিজের অনুমোদন নিষিদ্ধ; `if_sole_approver` একজন-Admin; audit চিহ্ন |
| `PayrollImmutabilityTest` | `approved`-এর পর item/breakdown সম্পাদনা 422; recompute নিষিদ্ধ; সংশোধন = পরের মাসের লাইন |
| `PayrollPaymentTest` | আংশিক পরিশোধ; `expenses` সারাংশ-সারি পদ্ধতি-ভিত্তিক; ব্যর্থ→পুনঃপরিশোধ; payout দ্বিগুণ-পরিশোধ নয় |
| `FinalSettlementTest` | ত্যাগ-মাস আনুপাতিক + অগ্রিম অবশিষ্ট + PF; পরে payee inactive |
| `PfLedgerTest`, `TaxModeTest` | নিয়োগকর্তা-অংশ payee থেকে কাটে না; slab সূত্র (সরলীকৃত) ফিক্সচারে |
| `SalaryAccessTest` | Teacher শুধু নিজের; Student/Parent 403; Super Admin ও impersonation 403 `sensitive_scope`; অ্যাকাউন্ট-নং কখনো ফেরত নয় |
| `PayrollTenancyTest` | অন্য প্রতিষ্ঠানের payee/run 404; `GeneratePayrollRun` `TenantAwareJob` |
| `AttendanceSummaryTest` | `user_id` নয়, payee-id দিয়ে উপস্থিতি; অনুমোদিত paid/unpaid ছুটি |
**Done When:** (১) school demo-তে ৫ শিক্ষক + ২ কর্মচারী: কাঠামো → regular run (একজনের মাঝ-মাসে ইনক্রিমেন্ট, একজনের অনুপস্থিতি, একজনের অগ্রিম) → review → অনুমোদন (দুজন ব্যবহারকারী) → পরিশোধ → slip PDF; সংখ্যা §১৬-র সূত্রে হাতে মেলে; (২) একটি backdated ইনক্রিমেন্টের arrears পরের run-এ ঠিক; (৩) ঈদ bonus run (১০০% মূল, আনুপাতিকসহ) আলাদা slip; (৪) অনুমোদিত run সম্পাদনা চেষ্টা 422; (৫) Teacher অন্যের slip চাইলে 403; (৬) মূল বেতনের সংখ্যা `audit_logs`/Sentry-তে নেই।

**মালিকের সিদ্ধান্ত বাকি:** (ক) কর্মচারীর স্বয়ংসেবার জন্য `staff` role কি চাই? (খ) `hr_payroll` কোন প্ল্যান থেকে (এখন Pro+; ছোট কোচিং কি পাবে)? (গ) ঈদ-বোনাস/ওভারটাইম/বেতন-হ্রাস/PF/কর সম্পর্কে আইনি নিয়ম — হিসাবরক্ষক/আইনজীবী থেকে নিশ্চিত করে সেটিং-ডিফল্ট ঠিক করুন। (ঘ) ব্যাংক disbursement ফরম্যাট (কোন ব্যাংক)। (ঙ) গ্র্যাচুইটি ও ছুটি-নগদায়ন চান কি?


## D85 — approved R3.4 contract

Owner approved all seven clauses in owner/staff-leave-contract-decision.md (approved text at 3ab01cc), locked by fb56d8c. They govern R3.4 over historical wording above. Leave status includes cancelled. Pending supports approve/reject/cancel; approved cancellation requires admin, reason and a date before from_date. Teacher access to the existing transition endpoint is limited to own pending cancellation; no accountant cancellation or staff role. Identical transitions are idempotent; conflicts 409; keep application rows and audit actors/reasons.

HR dates are inclusive and institution-local. Exclude all tenant holidays and institutions.settings.hr.weekly_holidays (ISO 1..7, default []); malformed configuration fails closed. Require at least one working date; split working dates across years/months. Under institution lock, check approved annual consumption plus candidate at create and approval; pending blocks overlapping ranges but does not reserve annual allowance. Override needs admin reason/audit. Approval audit snapshots accepted dates/is_paid; balances and summaries use snapshots rather than reinterpret later calendar/type changes. total_days is the accepted count. Audit uses IDs/dates/policy evidence under privacy rules, no pay amounts/PII.

AttendanceSummary::forPayee(type,id,month) clamps to joining/leaving dates and counts each working date once: approved leave takes precedence, missing mark is absent, late is present plus late_count. Return working_days, present_days, absent_days, leave_days, lwp_days, late_count. LeavePayrollLinkTest proves unpaid input (both payees/month boundaries), not later payroll execution or payslip deduction. No frozen payroll rewrite, UI, device, future scheduling tables, app/demo DB migration or later task. Existing 18 routes and all required focused/full/reference/parity/query/deep/guard checks remain.


## D86 — approved R3.5 execution contract

This section supersedes conflicting historical R3.5 acceptance above. Full seven-clause approved contract: owner/salary-structure-contract-decision.md, exact clauses a31faef; locked owner commit 4a0999d. Preserve six R3.5 tables and 24 routes, D32/D33, module/type lists, Decimal/Money arithmetic and independent fixtures. No later table migrations, UI, app/demo DB migration or real disbursement.

Bonus scheme CRUD/preview is R3.5; apply returns 409 dependency_pending without state/financial effects until approved R3.6 scheme-to-adjustment integration. R3.5 BonusSchemeTest proves eligibility/completed service months/proration/caps/exclusions and fail-closed retries. Idempotent bonus adjustments remain R3.6 acceptance; separate bonus run remains R3.7. Automatic arrears affecting already-ended payroll months fail closed at approval/application until paid-history/arrears integration exists; absence of future tables is not proof of no paid months. Explicit arrears_policy=none may waive automatic arrears with audited policy, without assuming legal rates.

Initial revision creates first structure. Institution-locked revisions enforce tenant identity and non-overlapping periods. Application closes only the immediately preceding active structure effective_to, retaining other fields/lines; reject retroactive insertion that reinterprets later existing structures. Future approved revisions wait for daily payroll:apply-revisions; apply only when due and reject stale source. Applied revisions/lines are immutable except approved service period close/tenant purge; audit rejection/cancellation of unapplied proposals. Preserve decrement reason, acknowledgement/min_basic and maker-checker safeguards.

salary_revisions.calculation_snapshot JSON NOT NULL stores immutable reviewed source structure/interval/line/component definitions and exact result/lines/policy evidence, not client totals. Source fingerprint changes at approval/application return 409 stale_revision and require new proposal. Sensitive snapshot amounts never enter audit/request logs.

Only existing GET /hr/people/{type}/{id}/salary broadens to admin,accountant,teacher; teacher own teacher profile only, unauthorized person/type 403. Other salary/pay-account routes remain admin/accountant; approvals admin-only service rules with audited sole-active-admin exception. Super Admin and explicit impersonated-token ability fail 403 sensitive_scope before sensitive data/query, without implementing future impersonation sessions. Teacher payroll caches leave fillable and service updates only today's active structure; derive staff salary from structure without adding cache columns.

Pay accounts encrypt account_number, never serialize/log full number; permit masked last-four only, reject caller ciphertext/ownership fields, atomic tenant/payee defaults. System/referenced components cannot be deleted or changed to reinterpret saved structures; deactivate/use new definitions. Required SalaryStructureTest, RevisionLifecycleTest, IncrementBatchTest, BonusSchemeTest, SalaryAccessTest and normal focused/full/reference/parity/query/deep/guard checks remain; no existing assertions/fixtures weakened.


## D87 R3.6 adjustment and advance contract

Locked decision D87 supersedes earlier conflicting R3.6 acceptance only. Approved contract at owner/advance-adjustment-contract-decision.md (clauses preserved in 5ce435b):

1. **Keep order and separate proof.** R3.6 implements its two tables, adjustment lifecycle, bonus-to-adjustment integration, advances, disbursement and a pure recovery calculation service. AdvanceRecoveryTest proves exact calculation, remaining-balance cap, minimum-net protection, reduced installments, final remainder and approved skip decisions without inventing payroll history or mutating recovered during preview. Actual payroll-linked deduction, recovered update/closure and retry proof remain explicit R3.7 acceptance. No payroll_runs/payroll_items migrations or bonus runs here. Automatic paid-month arrears remains fail-closed until R3.7.
2. **Retain teacher acceptance with an explicit route.** Add only GET /teacher/salary/advances to R3.6 (ten routes total); teacher sees only own teacher-profile advances. Existing nine routes remain admin/accountant. D33 denies Super Admin and explicit impersonated tokens before sensitive queries. Preserve module gating, tenant/foreign-ID checks and explicit resources; no account numbers or private storage paths in responses.
3. **Retain review and disbursement evidence in protected storage.** Add salary_advances.terms_snapshot JSON NOT NULL, immutable after request, containing exact reviewed terms, source salary identity and relevant limit policy; recheck stale salary/policy before approval/disbursement. Add expense_id BIGINT UNSIGNED NULL with a unique foreign key to expenses(id), assigned only by disbursement. Add skipped_months JSON NULL, service-managed append-only entries of month, reason, approver ID and timestamp; no client ownership/status/recovered/snapshot fields. No new ledger table. Write-off records reason/actor/event in existing audit_logs without amounts; preserve principal, recovered and expense history. Audit/request logs never contain salary/account amounts or personal data. Recovery consumption of a skip is R3.7, not claimed here.
4. **Atomic disbursement with existing finance rules.** Under the shared institution transaction lock, an approved advance appends exactly one immutable expense with source=advance and its actual payment method/date, links expense_id and transitions active atomically. Repeated identical disbursement returns the linked result; conflicting retry returns 409. Use a narrowly scoped internal ExpenseService operation, not the manual public input path; honor existing closed-day and D32/D81/D82 rules. Cashbook derives that expense once, with no second outflow row; cash only affects cash totals. No real payment/provider operation. Exempt no financial records from retention or tenant isolation.
5. **Approval, skips and adjustment rules.** Admin approves adjustments/advances and authorizes write-off/skip; preserve maker-checker and the configured audited sole-active-admin exception from the payroll module. Accountant may prepare and disburse an approved advance. For an optional adjustment approval threshold, require admin approval at every amount (including above threshold); do not grant self-approval below it. Pending adjustments may be approved or cancelled; approved values/payee/month are immutable, approved-but-unapplied cancellation is an audited state transition, applied adjustments are not cancelled or edited. Disallow future-dated or payroll-linked applied claims without actual integration. Validate positive exact money, kind/direction, required fine/bonus reasons, configured fine ceiling, active-advance count and gross-based limits. No inferred legal overtime/tax rates; manual extra-class entries remain available when substitution dependency is unavailable, and suggestions fail closed 409 dependency_pending rather than fabricating sessions.
6. **Bonus integration preserves reviewed results.** Add a server-owned immutable bonus_schemes.application_snapshot JSON NULL with source fingerprints, exact eligible payee/result lines and relevant policy on successful apply. Under the institution lock, recompute the existing preview from current server-owned definitions, snapshot it, create all eligible approved bonus adjustments atomically with unique scheme/payee keys and authorize through the same admin maker-checker rules. Mark scheme applied only with its complete effects; retry returns original linked rows without recomputing or duplicates. Reject stale explicit preview evidence if supplied; never accept client-computed amounts. No R3.7 run creation; retain all existing preview/reference arithmetic and fail-closed tests for unavailable dependencies by testing the dependency explicitly rather than assuming its permanent absence.
7. **Authorize precise refinement and tests only after owner commit.** Update corresponding module/API/schema/template/R3 scope/generated/query/export artifacts and the R3.7 acceptance pointer solely for clauses above. Replace only SalaryFoundationTest's salary_adjustments-absence assertion with positive R3.6 schema coverage; retain payroll_runs/payroll_items absence, staff-cache/teacher-fillable, tenant and financial immutability assertions. Adapt only BonusSchemeTest's permanent dependency expectation to distinguish unavailable dependency from accepted integration, retaining atomic failure/no-effect checks and adding successful apply/retry coverage. All other assertions/golden fixtures stay intact. Add AdvanceRecoveryTest plus adjustment/bonus/disbursement/teacher/D33/role/module/tenant/stale/retry/rollback/privacy tests. Require exact php artisan test --filter=Advance, full API/frontend/theme, independent references, generated freshness, schema parity, query-plan, deep and guard. No UI, app/demo DB migration, live disbursement, new dependencies or task reorder. R3.6 stays unchecked until every revised Done When passes.
