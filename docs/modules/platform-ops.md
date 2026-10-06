# Platform Operations (Revision 11)

> প্ল্যাটফর্ম-মালিকের (Super Admin) পাঁচটি ক্ষমতা ও প্রতিষ্ঠানের দিকের সংশ্লিষ্ট অংশ: **Support Ticket · কুপন · কর/ইনভয়েস · সীমিত impersonation · প্রতিষ্ঠান export/backup/restore**। হিসাব-সংখ্যা `infra/spec-verify/refs_r11.py`-এ এবং export/import-নকশা `infra/spec-verify/tenant_export_ref.py`-এ (আসল স্কিমার ওপর) যাচাইকৃত। সিদ্ধান্ত **D34, D38**; ফিক্সচার-ভিত্তি D32।
> Module key: `support` (চার ধরনেই, সর্বদা চালু)। বাকি চারটি Super Admin-এর কেন্দ্রীয় host-এর ফিচার (module-key নেই)।

---

## ১. Support Ticket
### ১.১ ডেটা ও নিয়ম
- `support_tickets` (প্রতিষ্ঠান-স্কোপড, `institution_id` আছে) ও `support_ticket_messages`। `ticket_no = TKT-YYYY-nnnnn` — **প্ল্যাটফর্ম-ব্যাপী অনন্য** (`platform_settings` `counters.ticket` সারি `lockForUpdate` করে, transaction-এ)।
- **কে খুলতে পারে:** প্রতিষ্ঠানের Admin ও Accountant। Teacher/Student/Parent নয় (সাপোর্ট-চ্যানেল প্রতিষ্ঠান-পরিচালকদের)।
- **ফর্ম:** বিষয়, ধরন (`general|billing|bug|how_to|feature|sms|payment|domain`), অগ্রাধিকার, বিবরণ, সংযুক্তি (সর্বোচ্চ ৩টি, `pdf/jpg/png`, প্রতিটি ≤ ৫ MB, **private disk**)। সিস্টেম নিজে একটি **প্রসঙ্গ-স্ন্যাপশট** জুড়ে দেয়: প্ল্যান, ধরন, অ্যাপ-সংস্করণ, ব্রাউজার; **কোনো ছাত্র/ব্যক্তিগত ডেটা নয়**।
- **স্থিতি:** `open → pending_platform ⇄ pending_customer → resolved → closed`। `resolved`-এর ৭ দিন পর সাড়া না এলে স্বয়ংক্রিয় `closed` (`platform_settings` `support.auto_close_days`); ওই ৭ দিনে প্রতিষ্ঠান উত্তর দিলে পুনরায় খোলে। বন্ধের পর রেটিং ১–৫।
- **SLA:** `first_response_due_at` = তৈরি + অগ্রাধিকার-ভিত্তিক ঘণ্টা (`support.sla_hours`; প্রস্তাবিত ডিফল্ট: urgent ২, high ৮, normal ২৪, low ৪৮ — **আপনার সামর্থ্য অনুযায়ী বদলান; আমি কোনো প্রতিশ্রুতি ধরিনি**)। অতিক্রান্ত টিকেট Super Admin-এর queue-তে লাল।
- **অভ্যন্তরীণ নোট:** `is_internal = true` বার্তা প্রতিষ্ঠানের কাছে কখনো যায় না (API ও রিপোর্ট উভয়ে ফিল্টার; `SupportVisibilityTest`)।
- **নোটিফিকেশন:** নতুন উত্তরে in-app + ইমেইল (বিদ্যমান `Mailable`); urgent-এ Super Admin-কে ইমেইল।
- **গোপনীয়তা:** টিকেটে ভুলক্রমে ব্যক্তিগত তথ্য আসতে পারে; বন্ধ টিকেট ২৪ মাস পর বেনামি/মোছা (প্রস্তাবিত retention, `docs/legal/` তালিকায় যোগ; **অযাচাইকৃত মেয়াদ**)।
### ১.২ Impersonation-অনুমতি
টিকেট-পাতায় প্রতিষ্ঠান "সাপোর্টকে এই টিকেটের জন্য অ্যাক্সেস দিন (২৪ ঘণ্টা / ৭২ ঘণ্টা)" বোতাম চাপলে `institutions.settings.support_grant = {until, ticket_id, granted_by, allow_changes}` বসে। **এই অনুমতি ছাড়া impersonation অসম্ভব** (§৪)।

## ২. কুপন
### ২.১ নিয়ম
`coupons` (প্ল্যাটফর্ম-স্তর, `institution_id` নেই) ও `coupon_redemptions` (প্রতিষ্ঠান-সহ)।
| ক্ষেত্র | অর্থ |
|---|---|
| `type` | `percent` (+ঐচ্ছিক `max_discount`) · `fixed` · `free_days` |
| প্রযোজ্যতা | `applies_to_plans`, `applies_to_types`, `min_amount`, `valid_from/until` |
| সীমা | `max_redemptions` (মোট), `per_institution_limit` (ডিফল্ট ১) |
| `status` | `draft → active ⇄ paused → expired` |
- কোড বড়হাতের `A–Z 0–9 -`, কেস-নিরপেক্ষ তুলনা। **যাচাইয়ে ভুল হলে একটিই সাধারণ বার্তা** ("কুপন প্রযোজ্য নয়") — কোন শর্তে আটকাল ফাঁস হয় না; `POST /subscription/coupon/validate` rate-limit ১০/মিনিট/প্রতিষ্ঠান।
- **সার্ভার সবসময় পুনর্গণনা করে** (ক্লায়েন্টের পাঠানো অঙ্ক কখনো নয়)। **ক্রম: কুপন-ছাড় আগে, কর পরে (ছাড়-পরবর্তী মূল্যের ওপর)।**
- **সংরক্ষণ:** checkout শুরুতে `coupon_redemptions` সারি (পেমেন্ট `pending`) ৩০ মিনিটের জন্য ধরা থাকে; ক্ষমতা-যাচাই = সম্পন্ন + ধরা-থাকা; পেমেন্ট ব্যর্থ/বাতিল হলে মুক্তি; সম্পন্নে `redeemed_count` বাড়ে (row lock) — শেষ-কুপন নিয়ে দুজনের প্রতিযোগিতায় একজনই পায়।
- **`free_days`:** টাকা নড়ে না। `payments` সারি (`amount=0`, `method=coupon`, `completed`), `subscription_expires_at` বাড়ে (মেয়াদোত্তীর্ণ হলে আজ থেকে গণনা), শূন্য-মূল্যের ইনভয়েস।
- রিপোর্ট: কুপন-ভিত্তিক ব্যবহার, মোট ছাড়, প্রতিষ্ঠান-ভিত্তিক।
### ২.২ যাচাইকৃত গণনা (প্ল্যান ৳৯৯৯; কর-হার ১৫% শুধু **উদাহরণ**)
| পরিস্থিতি | ছাড় | সাবটোটাল | কর | মোট |
|---|---|---|---|---|
| কর ও কুপন নেই | — | ৯৯৯.০০ | — | **৯৯৯.০০** |
| কর ১৫% (বাইরে) | — | ৯৯৯.০০ | ১৪৯.৮৫ | **১,১৪৮.৮৫** |
| কর ১৫% (অন্তর্ভুক্ত) | — | ৯৯৯.০০ | ১৩০.৩০ (নেট ৮৬৮.৭০) | **৯৯৯.০০** |
| ২০% কুপন, সর্বোচ্চ ১৫০, কর ১৫% বাইরে | **১৫০.০০** (২০% = ১৯৯.৮০ → সীমা) | ৮৪৯.০০ | ১২৭.৩৫ | **৯৭৬.৩৫** |
| ১০% কুপন, সীমা নেই | ৯৯.৯০ | ৮৯৯.১০ | — | ৮৯৯.১০ |
| স্থির ১০০ | ১০০.০০ | ৮৯৯.০০ | — | ৮৯৯.০০ |
| স্থির ২,০০০ (প্ল্যানের বেশি) | ৯৯৯.০০ (কখনো ঋণাত্মক নয়) | ০.০০ | — | ০.০০ |
| `free_days` ৩০ | টাকা-ছাড় নেই | — | — | ৩০ দিন মেয়াদ |

## ৩. কর ও ইনভয়েস (OD-4 — কাঠামো সমাধান, আইনি মান নয়)
- `platform_settings` `tax` = `{ "enabled": false, "rate": 0, "label": "VAT", "inclusive": false }` ও `seller` = `{ name, address, tax_id }`; ডিফল্ট **বন্ধ, হার ০**।
- প্রতিষ্ঠানের বিলিং-প্রোফাইল `institutions.settings.billing = { legal_name, address, tax_id, tax_exempt }`।
- ইনভয়েসে snapshot: `tax_rate`, `tax_label`, `tax_inclusive`, `discount`, `coupon_id` (হার পরে বদলালেও পুরনো ইনভয়েস অপরিবর্তিত)। `amount` = তালিকা-মূল্য, `discount`, `tax`, `total` — সূত্র §২.২।
- ইনভয়েস নম্বর (`INV-YYYY-nnnnn`) ফাঁকহীন সিকোয়েন্স (counter + lock); **বাতিল = credit-note** (`credit_for_id`, ঋণাত্মক), মোছা নয় (D32)।
- **আমি যা যাচাই করিনি:** কর-নিবন্ধন, কোন হার, মূল্য-অন্তর্ভুক্ত নাকি বাইরে, প্রতিষ্ঠান-ভেদে অব্যাহতি, ইনভয়েসের বাধ্যতামূলক বিষয়বস্তু। এগুলো সম্পূর্ণ আপনার হিসাবরক্ষক/আইনজীবীর সিদ্ধান্ত; সিস্টেম শুধু আপনার দেওয়া নিয়ম প্রয়োগ করে (D33-এর নীতি)।

## ৪. Impersonation (D34)
**উদ্দেশ্য:** সাপোর্টের সময় Super Admin প্রতিষ্ঠানের Admin/Teacher/Accountant যা দেখে তা দেখা। **ছাত্র/অভিভাবক হিসেবে নয়, কখনো।**
### ৪.১ শর্ত (সবগুলো লাগে)
1. প্রতিষ্ঠানের সক্রিয় `support_grant` (§১.২), `until` পেরোয়নি।
2. Super Admin-এর **2FA সক্রিয়** (super_admin-এর জন্য বাধ্যতামূলক), কারণ/টিকেট-নম্বর লিখিত।
3. লক্ষ্য-ব্যবহারকারী: `admin | teacher | accountant` — `student`/`parent` নয়।
4. মোড: `read_only` (ডিফল্ট); `full` কেবল যদি grant-এ `allow_changes = true`।
### ৪.২ প্রবাহ (token কখনো tenant-origin-এ ঘোরে না)
```
Super Admin (central host)  POST /super/institutions/{id}/impersonate { target_user_id, reason, mode }
   → impersonation_sessions(status=pending, code_hash, code_expires_at = now+60s)   → { url: https://{tenant-host}/impersonate?code=… }
Tenant SPA                  POST /auth/impersonate/exchange { code }        (throttle, একবার-ব্যবহার্য)
   → code যাচাই (hash, মেয়াদ, ব্যবহৃত নয়) → Sanctum token (ability: impersonated; মেয়াদ ৩০ মিনিট absolute, idle ১০) → session active
UI: স্থায়ী লাল ব্যানার "প্ল্যাটফর্ম সাপোর্ট আপনার হিসেবে দেখছে — শেষ হবে HH:MM" + "শেষ করুন"
```
### ৪.৩ প্রয়োগ
```php
// app/Http/Middleware/ImpersonationGuard.php   (after auth:sanctum; no-op unless the token has the 'impersonated' ability)
public function handle($request, Closure $next)
{
    $s = ImpersonationSession::forToken($request->user()->currentAccessToken());
    if (! $s) return $next($request);
    abort_if(SensitiveScope::matches($request), 403, 'sensitive_scope');                            // payroll, pay accounts, student docs/health/consents, export, credentials, users/passwords, auth changes
    abort_if($s->mode === 'read_only' && ! $request->isMethodSafe(), 403, 'impersonation_read_only');
    abort_if($s->expires_at->isPast(), 401, 'impersonation_expired');
    AuditLog::record('impersonation.request', null, ['session' => $s->id, 'method' => $request->method(), 'path' => $request->path()]);   // path only, no body, no data
    return $next($request);
}
```
- **`SensitiveScope` তালিকা** (এখানে `403 sensitive_scope`, শুধু পড়াও নয়): `/hr/*` (বেতন সংক্রান্ত সব), `/people/*/pay-accounts`, ছাত্রের নথি/স্বাস্থ্য/সম্মতি, `/admin/exports/*`, gateway/payout credentials, `/admin/users/*` (পাসওয়ার্ড/role/lock), `/auth/*` (পাসওয়ার্ড, token, সেশন), `/support/*grant*`, impersonation নিজেই। (D33)
- `audit_logs.impersonation_session_id` কলাম (এই ধাপে যোগ) — প্রতিটি অনুরোধের পথ+মেথড; **শরীর বা ডেটা নয়**।
### ৪.৪ প্রতিষ্ঠানকে জানানো
শুরুতে ও শেষে প্রতিষ্ঠানের সব Admin-কে in-app + ইমেইল: কে (সাপোর্ট-প্রতিনিধির প্রদর্শন-নাম), কখন, কারণ, মোড, কতক্ষণ। প্রতিষ্ঠান যেকোনো সময় grant প্রত্যাহার করতে পারে (চলমান session তৎক্ষণাৎ শেষ)।
### ৪.৫ সীমা
সর্বোচ্চ ৩টি session/দিন/প্রতিষ্ঠান; একসাথে একটি; Super Admin-এর শেষ session-তালিকা ও কারণ সবসময় দেখা যায় (জবাবদিহি)। **এই নকশার আইনি যথেষ্টতা** (ToS-এ সাপোর্ট-অ্যাক্সেস ধারা, শিশুর তথ্য) আইনজীবী যাচাই করবেন।

## ৫. প্রতিষ্ঠান export / backup / restore (D38)
### ৫.১ ধরন
| `kind` | কে চালায় | কী |
|---|---|---|
| `export` | প্রতিষ্ঠানের Admin (পাসওয়ার্ড পুনঃপ্রবেশ, 2FA থাকলে সেটিও) | নিজের ডেটার সম্পূর্ণ কপি (ডেটা-বহনযোগ্যতা) |
| `backup` | Super Admin (কারণসহ) | একই ফরম্যাট; প্ল্যাটফর্মের নির্ধারিত সময় রাখা |
**Restore = নতুন প্রতিষ্ঠান হিসেবে import** (`tenant:import`)। **কখনো বিদ্যমান প্রতিষ্ঠানের উপর লেখে না, কখনো মেশায় না।**
### ৫.২ ফরম্যাট (v1)
zip: `manifest.json` (ফরম্যাট-সংস্করণ, স্কিমা-মাইগ্রেশন-চিহ্ন, প্রতিষ্ঠান-নাম/ধরন, টেবিল-তালিকা ও সারি-সংখ্যা ও sha256), `data/<table>.ndjson` (এক সারি এক লাইন, FK-ক্রমে), `files/…` (ছবি, নথি, লোগো — মূল পথ ও sha256 সহ)। **Authenticated encryption**, passphrase অনুরোধকারী নিজে দেয় (প্ল্যাটফর্ম সংরক্ষণ করে না)। ডাউনলোড: signed, একবার-ব্যবহার্য, ২৪ ঘণ্টা; ফাইল private disk-এ, মেয়াদ-শেষে মোছা। ২৪ ঘণ্টায় ১টি export/প্রতিষ্ঠান। `tenant_exports` সারিতে অগ্রগতি/স্থিতি/checksum।
### ৫.৩ ম্যাপ — একমাত্র তালিকা (`docs/database/tenant-export-map.json`, জেনারেটেড ও commit-করা)
PHP `TenantExporter`/`TenantImporter` **কোনো টেবিল-তালিকা hard-code করে না**; ম্যাপ পড়ে। স্কিমা বদলালে ম্যাপ পুনরুৎপাদন (`python3 infra/spec-verify/tenant_export_ref.py . --write`) না করলে CI ব্যর্থ (`verify.py`)।
**আসল স্কিমায় মাপা (যা এই ডিজাইনকে বাধ্য করেছে):**
| | সংখ্যা |
|---|---|
| tenant টেবিল (`institution_id` আছে) | **১৩৭** — export-যোগ্য **১১৭**, বর্জিত **২০** (কারণসহ ম্যাপে) |
| আইডি-বহনকারী কলাম (`*_id`, `*_by`, `assigned_to`) | **২৭৫**, তার **১৮৫টিতে (৬৭%) কোনো FK নেই** — FK ধরে export করলে দুই-তৃতীয়াংশ রেফারেন্স নিঃশব্দে ভাঙত |
| polymorphic জোড়া (`payee_type+payee_id` ইত্যাদি) | ১৩ |
| আইডি-বহনকারী JSON কলাম | ১০ (`online_payments.items`, `result_sheets.rule`, `exam_attempts.answers`, `final_results.details`, `fee_refunds.refund_lines`, `admission_draws.result`, `bonus_schemes.applies_to`, `sms_campaigns.audience`, `payroll_items.breakdown`, `institution_events.program_ids`) |
| গ্লোবাল-unique কলাম যা পুনরায় import-এ সংঘর্ষ ঘটায় | `online_payments.gateway_ref` → import-এ `IMP-<নতুন>-<পুরনো>` |
**বর্জিত (২০):** `audit_logs`, `impersonation_sessions`, `tenant_exports`, `support_*`, `import_*`, `device_punches`, `attendance_devices` (গ্লোবাল key; নতুন করে নিবন্ধন), `institution_domains` (গ্লোবাল unique), `institution_payment_gateways` ও `institution_payout_accounts` (**secrets — কখনো export-এ নয়, `include_secrets` থাকলেও এই সংস্করণে নয়**), `settlements`, `sms_logs`, `sms_credit_transactions`, `coupon_redemptions`, `institution_theme_logs`, `student_import_logs`, `subscription_invoices`, `payments`।
**Import-ক্রমে JSON-এর ভেতরের নির্ভরতাও:** যেমন `exam_attempts.answers` প্রশ্নের আইডি রাখে (কোনো FK নেই) — তাই `exam_questions` আগে বসতে হয় (`JSON_DEPS`)।
### ৫.৪ Import অ্যালগরিদম
1. নতুন `institutions` সারি (`status = importing`; নতুন slug; plan = ট্রায়াল) — বিদ্যমান কিছু স্পর্শ নয়।
2. ম্যাপের `order` অনুযায়ী প্রতি টেবিলে প্রতি সারি: `id` বাদ, `institution_id` = নতুন, প্রতিটি `refs` কলাম পুরনো→নতুন id-ম্যাপে বদল, polymorphic জোড়া টাইপ দেখে, JSON-এর ভেতরের id handler দিয়ে, গ্লোবাল-unique পুনরুৎপাদন; self-reference (`parent_id`, `reverses_id`) দুই ধাপে। বর্জিত টেবিলের প্রতি রেফারেন্স (`online_payments.settlement_id`) `NULL`।
3. **ম্যাপে না-থাকা রেফারেন্স পেলে import থামে** (KeyError নয়, স্পষ্ট ত্রুটি) ও নতুন প্রতিষ্ঠানের সব সারি মুছে ফেলে (purge) — আধা-import নয়।
4. শেষে `status = trial/active` (Super Admin বেছে), `audit_logs`-এ একটি "imported from export #N"।
5. এরপর Admin-কে করতে হবে: gateway/payout credentials, device নিবন্ধন, domain, ও (যদি `include_logins=false`) সবার পাসওয়ার্ড রিসেট। ব্যবহারকারীর পাসওয়ার্ড hash ডিফল্টে রক্ষিত (এনক্রিপ্টেড ফাইলের ভেতরে)।
### ৫.৫ প্রমাণ (কাজ-করা প্রোটোটাইপ, আসল স্কিমায়)
১১৭ টেবিল জুড়ে ২৩৪ কৃত্রিম সারি (প্রতিটিতে বৈধ রেফারেন্স, polymorphic ও JSON-id সহ) প্রতিষ্ঠান A-তে → export → B হিসেবে import: **সারি-সংখ্যা সমান; B-র প্রতিটি রেফারেন্স B-র ভেতরে (A-তে কোনো ফাঁস নেই, ঝুলন্ত নেই); দুই প্রতিষ্ঠানের ডেটা কাঠামোগতভাবে হুবহু এক (id-র বদলে rank দিয়ে তুলনা, JSON-এর ভেতরের id সহ)।**
পরীক্ষা ফাঁপা নয় তার প্রমাণ: ম্যাপ ছয়ভাবে ভেঙে (একটি non-FK কলাম ভুলে যাওয়া ×২, JSON handler ভুলে যাওয়া, import-ক্রমের নির্ভরতা ভুলে যাওয়া, ভুল টেবিলে বাঁধা, গ্লোবাল-unique পুনরুৎপাদন বাদ) প্রতিবার সনাক্ত। *প্রথম প্রচেষ্টায় ৬টির ৪টি ধরা পড়েনি* — কারণ আমি ডেটা ভরছিলাম পরীক্ষাধীন ম্যাপ দিয়েই; এখন ভরা ও বিচার হয় অপরিবর্তিত "সত্য-ম্যাপ" দিয়ে।
### ৬.৭ বেতন-ডেটা ও `backup` (R12 সংশোধন, D33 × D38)
Super Admin-চালিত `backup` তার **নিজের** passphrase-এ এনক্রিপ্ট হয়, তাই ভিতরের সবকিছু প্ল্যাটফর্ম-অপারেটরের পড়ার যোগ্য। অতএব **`backup`-এ বাদ**: `salary_components`, `salary_structures`, `salary_structure_lines`, `salary_revisions`, `salary_adjustments`, `bonus_schemes`, `salary_advances`, `salary_pay_accounts`, `payroll_runs`, `payroll_items`, `provident_fund_entries` এবং `teachers.salary/house_rent/medical_allowance/transport_allowance` কলাম (শূন্য করে)। প্রতিষ্ঠান-Admin নিজের `export`-এ (নিজের passphrase, পাসওয়ার্ড পুনঃপ্রবেশসহ টিক-বক্স) এগুলো রাখতে পারে। তালিকাটি `docs/database/tenant-export-map.json` → `backup_excludes`; `salary_*`/`payroll_*`/`provident_*` নামের নতুন টেবিল তালিকায় না থাকলে CI ব্যর্থ (`infra/spec-verify/tenant_export_ref.py --check`)।
**সীমা (সততার সাথে):** দুর্যোগে বেতন-সহ পূর্ণ পুনরুদ্ধার *এই পথে হয় না* — তা অবকাঠামোর DB-backup থেকে (`restore-runbook`), যেখানে DB-অ্যাক্সেসধারী অপারেটর সবকিছুই দেখতে পারে; D33 নিয়ন্ত্রণ করে **অ্যাপ্লিকেশনের ভূমিকা**, অবকাঠামো-অপারেটরকে নয় — সেখানে ডিস্ক-এনক্রিপশন, অ্যাক্সেস-লগ ও কর্মী-চুক্তিই রক্ষা।

### ৫.৬ restore-runbook (একটি প্রতিষ্ঠান DB-backup থেকে)
স্ক্র্যাচ সার্ভারে পুরো DB-backup ফিরিয়ে → সেখানে `tenant:export {id}` → production-এ `tenant:import --new-slug=…` → ডোমেইন ও secrets নতুন করে → পুরনো slug আর্কাইভ। (মাসিক restore-drill `docs/ops/`-এ।)
### ৫.৭ সীমা
সুনির্দিষ্ট সময়ে ফেরা (point-in-time) নেই; আংশিক টেবিল-restore নেই; বিদ্যমান প্রতিষ্ঠান-প্রতিস্থাপন নেই। PHP আমদানিকারক লেখা হয়নি — এই প্রমাণ নকশার; PHP পোর্ট একই ম্যাপ ও একই round-trip পরীক্ষা (`TenantRoundTripTest`) মানতে বাধ্য। এনক্রিপশন-লাইব্রেরি, বড় প্রতিষ্ঠানের (লাখ সারি) গতি/মেমরি অযাচাইকৃত।

## ৬. Platform settings
`platform_settings` (key → JSON): `tax`, `seller`, `invoice.prefix`, `support.sla_hours`, `support.auto_close_days`, `counters.ticket`, `counters.invoice`, `export.retention_days` (ডিফল্ট ১), `backup.retention_days`। শুধু Super Admin; প্রতিটি বদল `audit_logs`; সংবেদনশীল কিছু নয় (secrets `.env`-এ, এখানে নয়)।

## ৭. Endpoint ও মেনু
```
# প্রতিষ্ঠান (tenant host)
GET|POST /support/tickets   GET /support/tickets/{id}   POST /support/tickets/{id}/messages | close | reopen | rate | grant-access {hours, allow_changes}   DELETE /support/tickets/{id}/grant-access
POST /subscription/coupon/validate { code, plan_id, cycle }          POST /subscription/checkout { plan_id, cycle, coupon? }
GET|POST /admin/exports      GET /admin/exports/{id}      GET /admin/exports/{id}/download   (signed, একবার)
POST /auth/impersonate/exchange { code }     POST /auth/impersonate/end
# Super Admin (central)
GET /super/support/tickets  …/{id}  POST …/{id}/messages {internal?} | assign | status         GET|POST|PUT /super/coupons   GET /super/coupons/{id}/redemptions
GET|PUT /super/platform-settings     POST /super/institutions/{id}/impersonate     POST /super/institutions/{id}/backup { reason }
POST /super/institutions/import { export_id | upload, new_slug, type }     POST /super/payments/{id}/refund
```
মেনু (Super): Support · কুপন · বিলিং-সেটিংস (কর/ইনভয়েস) · Export/Backup। প্রতিষ্ঠান: সেটিংস → "সাপোর্ট" (`module: support`), "ডেটা export"।

## ৮. পরীক্ষা
| Test | Asserts |
|---|---|
| `SupportVisibilityTest` | অভ্যন্তরীণ নোট প্রতিষ্ঠানে কখনো নয় (API, মেইল, রিপোর্ট); অন্য প্রতিষ্ঠানের টিকেট 404; Teacher খুলতে পারে না |
| `TicketNumberTest` | `TKT-` প্ল্যাটফর্ম-অনন্য, ১০ সমান্তরাল অনুরোধেও ফাঁক/ডুপ্লিকেট নেই |
| `TicketLifecycleTest` | SLA-সময়; ৭ দিন পর auto-close; উত্তরে reopen; রেটিং শুধু বন্ধের পর |
| `CouponMathTest` | §২.২-এর ৮ সারি |
| `CouponRaceTest` | শেষ কুপন ২ জনে: একজন; ব্যর্থ পেমেন্টে মুক্তি; per-institution-limit; সাধারণ ত্রুটি-বার্তা |
| `FreeDaysCouponTest` | `payments` ০, `method=coupon`, মেয়াদ বাড়ে, শূন্য ইনভয়েস |
| `InvoiceTaxTest` | exclusive/inclusive; হার বদলালে পুরনো ইনভয়েস অপরিবর্তিত; নম্বর ফাঁকহীন; credit-note ঋণাত্মক |
| `ImpersonationConsentTest` | grant ছাড়া 403; মেয়াদ-শেষে 401; student/parent লক্ষ্য 422; 2FA ছাড়া Super Admin 403 |
| `ImpersonationExchangeTest` | code একবার; ৬০ সেকেন্ডের পর ব্যর্থ; token-ability `impersonated`; ৩০ মিনিটে মেয়াদ-শেষ |
| `ImpersonationGuardTest` | read_only-তে POST 403; `sensitive_scope` রুটগুলো (payroll, নথি, credentials, users) read-ও 403; audit-এ শরীর নেই |
| `ImpersonationNoticeTest` | শুরু/শেষে সব Admin-কে নোটিফিকেশন; প্রত্যাহারে সেশন তৎক্ষণাৎ শেষ |
| `ExportMapFreshTest` | জেনারেটেড ম্যাপ = committed ম্যাপ (স্কিমা বদলালে ব্যর্থ) |
| **`TenantRoundTripTest`** | §৫.৫-এর পরীক্ষা PHP-তে: সংখ্যা, ভেতরে-রেফারেন্স, কাঠামো-অভিন্নতা; ছয় ভাঙা-ম্যাপ সনাক্ত |
| `ExportSecretsTest` | gateway/payout secrets ও `audit_logs` ফাইলে নেই; অন্য প্রতিষ্ঠানের কোনো সারি নেই (প্রতিষ্ঠান A-র export-এ B-র সারি শূন্য) |
| `ExportAccessTest` | শুধু নিজের Admin; পাসওয়ার্ড পুনঃপ্রবেশ; ২৪ ঘণ্টায় ১টি; signed link একবার; মেয়াদে ফাইল মোছা |
| `ImportSafetyTest` | বিদ্যমান প্রতিষ্ঠান স্পর্শ নয়; ম্যাপহীন রেফারেন্সে থামে ও নতুন প্রতিষ্ঠান purge হয় |

## ৯. Done When
- [ ] টিকেট খুলে উত্তর-প্রত্যুত্তর, অভ্যন্তরীণ নোট লুকানো, SLA-লাল, বন্ধ-রেটিং
- [ ] কুপন-সহ checkout-এ §২.২-এর অঙ্ক হুবহু; ব্যর্থ পেমেন্টে কুপন ফেরে
- [ ] grant ছাড়া impersonation অসম্ভব; grant-সহ read-only সেশনে payroll/নথি ৪০৩; প্রতিষ্ঠান নোটিফিকেশন পায়
- [ ] একটি demo প্রতিষ্ঠানের export → নতুন slug-এ import → দুটি তুলনায় কাঠামো অভিন্ন, secrets বাদ
- [ ] স্কিমায় একটি নতুন টেবিল যোগ করে ম্যাপ পুনরুৎপাদন না করলে CI ব্যর্থ
