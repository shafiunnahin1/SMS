# Accounting — সাধারণ হিসাব-খাতা (Revision 12)

> **ফি/খরচ/বেতন/স্টোর/দান — সব টাকার চলাচল এক জায়গায় দ্বৈত-হিসাবে (double entry)।** টেবিল (`docs/database/schema.sql`): `ledger_accounts`, `vouchers`, `voucher_lines`, `budgets`, `budget_lines`।
> **সীমা (সততার সাথে):** (ক) আমি বাংলাদেশের হিসাব-মান, নিরীক্ষা বা কর-ফরম্যাট যাচাই করিনি; চার্ট ও রিপোর্টের নাম **নমুনা** — প্রতিষ্ঠানের হিসাবরক্ষক ঠিক করবেন। (খ) ডিফল্ট **নগদ-ভিত্তিক (cash basis)**: বকেয়া ফি "প্রাপ্য" হিসেবে ধরা হয় না, টাকা এলে আয়। (গ) সংখ্যাগুলো স্বাধীন reference-এ যাচাইকৃত (`infra/spec-verify/refs_r11.py`, `refs_r12.py`); PHP চালানো হয়নি।
> Module key: `accounting` (প্ল্যান-নিয়ন্ত্রিত, Pro+)। ধরন: school · college · coaching। Roles: Admin, Accountant। সিদ্ধান্ত **D36**।

## ১. নীতি (D36)
1. **দ্বৈত-হিসাব:** প্রতিটি ভাউচারে `Σ debit = Σ credit` (২ দশমিকে); অসমান ভাউচার সংরক্ষণই হয় না (`post()` 422)।
2. **append-only:** `posted` ভাউচার সম্পাদনা/মুছা নেই; ভুল = **উল্টো ভাউচার** (`status=reversed`, `reverses_id`) + নতুন সঠিক ভাউচার (D32-র নীতি)।
3. **স্বয়ংক্রিয় ভাউচার idempotent:** একটি উৎস-রেকর্ডে একবারই (`UNIQUE (institution_id, source, source_id)`); ম্যানুয়ালে `source_id = NULL` (একাধিক চলে)।
4. **শুরুর তারিখ:** `settings.accounting.start_date` — এর আগের লেনদেন পোস্ট হয় না; শুরুতে **opening balance ভাউচার** (জার্নাল) দিতে হয়। পুরনো ফি-ইতিহাস আপনা-আপনি ব্যাক-পোস্ট হয় না (দরকার হলে `repost` টুল, §৫)।
5. **লক:** `settings.accounting.locked_until` (তারিখ) — এর সমান বা আগের তারিখে পোস্ট/উল্টানো নিষিদ্ধ; Admin কারণসহ বদলায় (audit)।
6. **ফান্ড-হিসাব সীমিত:** voucher_lines-এ fund-কলাম নেই; দান-ফান্ডের আয় **ফান্ড-নির্দিষ্ট আয়-অ্যাকাউন্টে** (`4300.<fund_id>`), আর সীমাবদ্ধ ফান্ড থেকে ব্যয় শুধু `expenses.fund_id` দিয়ে (`docs/modules/donations.md`); ম্যানুয়াল ভাউচার ফান্ড-অ্যাকাউন্ট ছুঁতে পারে না।

## ২. ডিফল্ট চার্ট (নমুনা; সম্পাদনাযোগ্য, `is_system` ছাড়া মুছা যায়)
| কোড | নাম | ধরন | নগদ/ব্যাংক? |
|---|---|---|---|
| 1100 | হাতে নগদ | asset | ✓ |
| 1200 | ব্যাংক | asset | ✓ |
| 1300 | মোবাইল ব্যাংকিং (bKash/Nagad…) | asset | ✓ |
| 1400 | কর্মীর অগ্রিম | asset | |
| 1500 | মজুত (inventory) | asset | |
| 2100 | PF প্রদেয় | liability | |
| 3100 | সাধারণ তহবিল / আদি জের | equity | |
| 4110 | টিউশন ও ফি (ফি-খাত ধরে উপ-অ্যাকাউন্ট `4110.<fee_category_id>` স্বয়ংক্রিয়) | income | |
| 4200 | ভর্তি / আবেদন ফি | income | |
| 4300 | দান ও অনুদান (উপ-অ্যাকাউন্ট `4300.<fund_id>` স্বয়ংক্রিয়) | income | |
| 4400 | স্টোর বিক্রয় | income | |
| 4900 | অন্যান্য আয় | income | |
| 5100 | বেতন ও ভাতা | expense | |
| 5110 | PF (নিয়োগকর্তা-অংশ) | expense | |
| 5200 | ইউটিলিটি | expense | |
| 5300 | ভাড়া | expense | |
| 5400 | মেরামত/রক্ষণাবেক্ষণ | expense | |
| 5500 | স্টেশনারি | expense | |
| 5700 | বিক্রিত পণ্যের ব্যয় (COGS) | expense | |
| 5900 | অন্যান্য ব্যয় | expense | |
`expenses.category` → ব্যয়-অ্যাকাউন্ট ম্যাপিং `settings.accounting.expense_map` (অ-ম্যাপ করা = 5900)। আয়-অ্যাকাউন্ট `4110.x` প্রথম ব্যবহারে স্বয়ংক্রিয় তৈরি।

## ৩. স্বয়ংক্রিয় পোস্টিং (listener → queue, `TenantAwareJob`)
| উৎস (`vouchers.source`) | `source_id` | পোস্টিং |
|---|---|---|
| `fee` — রসিদ | রসিদের `line_no = 1` লাইনের `fee_payments.id` | Dr (নগদ \| ব্যাংক \| মোবাইল — `payment_method` অনুযায়ী) · Cr ফি-খাত অনুযায়ী আয় (লাইন ধরে) |
| `refund` — ফি রিফান্ড | `fee_refunds.id` | Dr ফি-আয় · Cr নগদ/ব্যাংক/মোবাইল |
| `expense` | `expenses.id` | Dr ব্যয়-অ্যাকাউন্ট · Cr নগদ/ব্যাংক/মোবাইল |
| `payroll` — run পরিশোধ | `payroll_runs.id` | Dr 5100 (কর্তন-পরবর্তী মোট আয়) · Cr 2100 PF-কর্তন · Cr 1400 অগ্রিম-পুনরুদ্ধার · Cr নগদ/ব্যাংক (নেট); নিয়োগকর্তা-PF: Dr 5110 · Cr 2100 |
| `advance` — অগ্রিম প্রদান | `salary_advances.id` | Dr 1400 · Cr নগদ/ব্যাংক |
| `store` — বিক্রি | `inventory_movements.id` | Dr নগদ · Cr 4400; এবং Dr 5700 · Cr 1500 (moving-average ব্যয়) |
| `store` — ক্রয় (receive) | movement id | Dr 1500 · Cr নগদ/ব্যাংক |
| `donation` | `donations.id` | Dr নগদ/ব্যাংক/মোবাইল · Cr `4300.<fund_id>` |
**ব্যর্থ পোস্টিং:** নীরবে হারায় না — "অপোস্টেড উৎস" রিপোর্ট (`GET /accounting/reports/unposted`) এমন প্রতিটি উৎস-রেকর্ড দেখায় যার ভাউচার নেই; "পুনরায় পোস্ট" বোতাম idempotent। **যাচাই করা:** একটি পূর্ণ দিনের (ফি নগদ+bKash, রিফান্ড, ব্যয়, বেতন, স্টোর বিক্রি+COGS, দান) ভাউচারের trial balance ঠিক ০.০০, আর লেজারের নগদ-অ্যাকাউন্ট = ক্যাশবুকের expected closing (**১৯,৪০০.০০** ফিক্সচারে); bKash রসিদ নগদ-অ্যাকাউন্টে হাত দেয় না।

## ৪. রিপোর্ট
Trial balance · অ্যাকাউন্ট-খতিয়ান (ledger statement, তারিখ-সীমা, শুরুর জেরসহ) · আয়-ব্যয় বিবরণী · স্থিতিপত্র (সরলীকৃত, নগদ-ভিত্তিক) · বাজেট বনাম প্রকৃত · ফান্ড-ভিত্তিক বিবরণী (`donations.md`) · অপোস্টেড উৎস। সব PDF/Excel locale অনুযায়ী (`docs/I18N.md` §৮-এর engine-শর্ত)।
**বাজেট বনাম প্রকৃত (যাচাইকৃত):** বাজেট ৬,০০,০০০, প্রকৃত ২,৮৮,০০০ ⇒ ৪৮.০০% ব্যবহৃত; বাজেট ৬০,০০০, প্রকৃত ৭১,০০০ ⇒ ভ্যারিয়েন্স −১১,০০০.০০ (অতিরিক্ত ব্যয়); প্রকৃত ০ ⇒ ০.০০%।

## ৫. ব্যাংক মিলান ও টুল
- **Bank reconciliation:** ব্যাংক-অ্যাকাউন্টের লাইনে `voucher_lines.reconciled_at/reconciled_ref`; স্টেটমেন্ট CSV (সাধারণ কলাম: তারিখ, বিবরণ, ডেবিট, ক্রেডিট, রেফারেন্স) আপলোডে পরিমাণ+±৩ দিনে প্রস্তাবিত মিল; ব্যবহারকারী নিশ্চিত করে; অমিল তালিকা আলাদা। **কোনো ব্যাংকের নির্দিষ্ট ফরম্যাট দাবি নেই।**
- **Opening wizard:** শুরুর তারিখ → প্রতিটি নগদ/ব্যাংক/মোবাইল ও অন্যান্য অ্যাকাউন্টের জের → একটি জার্নাল-ভাউচার (Dr/Cr সমান না হলে 3100-এ ভারসাম্য).
- **Repost টুল:** তারিখ-সীমার জন্য `source`-ভিত্তিক পুনঃপোস্ট (শুধু যাদের ভাউচার নেই); শুরুর-তারিখের আগের উৎস পোস্ট করে না।
- ভাউচার-নম্বর: `{JV|RV|PV|CV}-{YYYY}-{seq}` (প্রতি ধরন, institution row lock; রসিদ-নম্বরের মতো)।

## ৬. Endpoint (`module:accounting`, roles admin+accountant)
```
GET|POST|PUT /accounting/accounts      GET /accounting/accounts/tree
GET|POST /accounting/vouchers          GET /accounting/vouchers/{id}      POST /accounting/vouchers/{id}/post | reverse { reason }
GET|POST|PUT /accounting/budgets       PUT /accounting/budgets/{id}/lines     POST /accounting/budgets/{id}/approve
GET  /accounting/reports/{trial-balance|ledger|income-expenditure|balance-sheet|budget-actual|unposted}
GET  /accounting/bank-reconciliation/{account_id}     POST /accounting/bank-reconciliation/{account_id}/import | match | unmatch
POST /accounting/opening-balances     POST /accounting/repost { from, to }     PUT /accounting/settings { start_date, locked_until, expense_map }
```

## ৭. পরীক্ষা
| Test | Asserts |
|---|---|
| `VoucherBalanceTest` | অসমান ভাউচার 422; ২-দশমিক সমতা; এক লাইনে debit ও credit দুটোই ≠ ০ নিষিদ্ধ |
| `VoucherImmutabilityTest` | posted সম্পাদনা/মুছা 422; reverse = উল্টো লাইন; দুবার reverse নিষিদ্ধ |
| `AutoPostingIdempotentTest` | একই `fee`/`expense`/`payroll` দুবার পোস্ট চেষ্টায় একটিই ভাউচার (unique index) |
| `PostingMapTest` | §৩ সারণির প্রতিটি উৎস: লাইন ও পরিমাণ; payroll-ফিক্সচার (নেট ২১,৫৩২.২৬ ইত্যাদি) |
| `LedgerCashEqualsCashBookTest` | একটি পূর্ণ দিনে লেজারের 1100 = ক্যাশবুক expected closing; bKash রসিদ 1300-এ |
| `TrialBalanceZeroTest` | যেকোনো সময়ে Σ(Dr−Cr) = ০.০০ |
| `PeriodLockTest` | `locked_until`-এ/আগে পোস্ট/reverse নিষিদ্ধ; Admin কারণসহ বদলায়, audit |
| `StartDateTest` | শুরুর-আগের উৎস পোস্ট হয় না; opening balance ভারসাম্য |
| `FundAccountGuardTest` | ম্যানুয়াল ভাউচার `4300.*`-এ নিষিদ্ধ |
| `BudgetActualTest` | §৪-র তিনটি সংখ্যা |
| `BankReconcileTest` | মিল/অমিল; একই লাইন দুবার নয় |
| `AccountingTenancyTest` | অন্য প্রতিষ্ঠানের ভাউচার/অ্যাকাউন্ট 404; listener `TenantAwareJob` |
| `AccountingAccessTest` | Teacher/Student/Parent/Super Admin ও impersonation-এ 403 (আর্থিক-সংবেদনশীল) |

## ৮. Done When
- [ ] school demo-তে এক সপ্তাহের লেনদেন (ফি নগদ+bKash, রিফান্ড, ব্যয়, payroll, স্টোর বিক্রি, দান) → trial balance ০.০০; নগদ-লেজার = ক্যাশবুক
- [ ] একটি ভাউচার reverse করলে মূল ও উল্টো মিলে নেট ০; মূলটি অপরিবর্তিত
- [ ] `locked_until` মাসের তারিখে পোস্ট চেষ্টা 422
- [ ] অপোস্টেড-রিপোর্ট ইচ্ছাকৃতভাবে ভাঙা listener-এ উৎসটি দেখায়, repost-এ ঠিক হয়
- [ ] হিসাবরক্ষক চার্ট/রিপোর্টের নাম-ফরম্যাট দেখে লিখিত মতামত দিয়েছেন (**অযাচাইকৃত অংশ**)

## ৯. মালিকের সিদ্ধান্ত বাকি
(ক) accrual (বকেয়া ফি প্রাপ্য) চান কি — এখন নেই। (খ) বাংলাদেশের নিরীক্ষা/কর-ফরম্যাটের রিপোর্ট। (গ) বহু-শাখার একত্রিত হিসাব (`multi_branch`) — এখন প্রতি শাখা আলাদা।
