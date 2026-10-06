# Privacy, Consent, Retention & Erasure (Revision 7)

> **⚠ আইনি সতর্কতা — এটি আইনি পরামর্শ নয়।** এই নথি *প্রযুক্তিগত নকশা* ও একটি *খসড়া কাঠামো*। বাংলাদেশে ব্যক্তিগত তথ্য সুরক্ষার বর্তমান আইনি অবস্থা (আইন/অধ্যাদেশ, শিশুর তথ্য, প্রতিষ্ঠান বনাম প্ল্যাটফর্মের দায়, তথ্য সংরক্ষণের বাধ্যতামূলক মেয়াদ) আমি নিশ্চিত করতে পারিনি। নিচের "controller / processor" কাঠামো একটি **নকশা-অনুমান** (আন্তর্জাতিক সাধারণ প্রথা)। প্রকাশ্যে চালুর আগে একজন বাংলাদেশি আইনজীবীকে `docs/legal/` পুরোটা দেখান এবং তাঁর মতামত অনুযায়ী বদলান। ধারণা হিসেবে "যাচাই করুন" বলা জায়গাগুলোতে সংখ্যা/দিন বদলাতে পারে।

## 0. কেন এখনই দরকার
এই সিস্টেম মূলত **নাবালকদের** তথ্য রাখে: নাম, জন্মতারিখ, ছবি, অভিভাবকের ফোন, স্বাস্থ্য-রেকর্ড, আচরণ-লগ, ফলাফল, ফি। স্কুল-কলেজ-কোচিং-প্রাইভেট শিক্ষক — সবাই এ তথ্যের সংগ্রাহক। পাবলিক ফর্ম (ভর্তি-আবেদন), SMS gateway, পেমেন্ট gateway, ক্লাউড স্টোরেজ — প্রতিটিই তথ্য বাইরে পাঠায়। আইনি প্রয়োজন যা-ই হোক, নকশা-স্তরে এই ছয়টি জিনিস না থাকলে পরে জোড়া দেওয়া কষ্টের: **কী রাখি, কেন, কতদিন, কে দেখে, কীভাবে মুছি, কার সম্মতিতে।**

## 1. কে কী (নকশা-অনুমান)
| ভূমিকা | কে | দায় |
|---|---|---|
| তথ্যের মালিক/সংগ্রাহক ("Controller") | **প্রতিষ্ঠান** (স্কুল/কলেজ/কোচিং/শিক্ষক) | কী তথ্য নেবে, কেন, কতদিন; অভিভাবকের সম্মতি নেওয়া; ভুল সংশোধন |
| প্রক্রিয়াকারী ("Processor") | **আপনি (প্ল্যাটফর্ম)** | প্রতিষ্ঠানের নির্দেশে সংরক্ষণ ও প্রক্রিয়া; নিরাপত্তা; মুছে ফেলা; তথ্য রপ্তানি |
| উপ-প্রক্রিয়াকারী | SMS gateway, পেমেন্ট gateway, ক্লাউড/হোস্টিং, ইমেইল | তালিকাভুক্ত (নিচে §6) |
এ জন্য প্রতিষ্ঠান সাইন-আপে ToS-এর অংশ হিসেবে "Data Processing" শর্তে সম্মত হয় (খসড়া §8)। **ব্যতিক্রম:** প্ল্যাটফর্ম-মোডে ফি সংগ্রহ (`online-fee-payment.md`) এবং প্রাইভেট শিক্ষক (একজন ব্যক্তি = controller) — আইনজীবীর সঙ্গে আলাদা আলোচনা।

## 2. তথ্য-তালিকা (Data Inventory)
| বিভাগ | তথ্য | কোথায় | সংবেদনশীল? | যারা দেখে |
|---|---|---|---|---|
| পরিচয় | নাম, জন্মতারিখ, লিঙ্গ, ধর্ম, রক্তের গ্রুপ, ছবি | `students`, `users` | মাঝারি (শিশু) | admin, শিক্ষক (নিজের batch), অভিভাবক |
| যোগাযোগ | অভিভাবকের ফোন/ইমেইল/ঠিকানা | `students`, `users` | মাঝারি | admin, accountant; শিক্ষক **শুধু** প্রয়োজনে (নাম্বার মাস্ক) |
| স্বাস্থ্য | `health_records` | | **উচ্চ** | admin, ও নির্ধারিত শিক্ষক; অভিভাবক |
| আচরণ | `behavior_logs` | | **উচ্চ** | admin, শ্রেণিশিক্ষক; অভিভাবক |
| একাডেমিক | হাজিরা, ফলাফল | | মাঝারি | admin, শিক্ষক, ছাত্র, অভিভাবক |
| টাকা | ফি, রসিদ, অনলাইন পেমেন্ট | | মাঝারি | admin, accountant, অভিভাবক |
| নথি | ভর্তির কাগজ (`student_documents`), জন্মনিবন্ধন | | **উচ্চ** | admin |
| প্রচার | ভর্তি-আবেদন (`admission_leads`) | | নিম্ন-মাঝারি | admin |
| প্রযুক্তিগত | লগইন-লগ, ip_hash, device | | নিম্ন | নিজে (সেশন), Super Admin (ঘটনা তদন্ত) |
**প্রযুক্তিগত নিয়ম:** (১) ছবি ও নথি **private storage**-এ, অ্যাক্সেস signed/temporary URL-এ (`Storage::temporaryUrl`, ৫–১০ মিনিট) — `Storage::url()` শুধু লোগো/hero ছবির মতো প্রকাশ্য সম্পদে। (২) লগ/Sentry-তে ফোন/নাম/স্বাস্থ্য/ message body নয় (`Sentry before_send` scrub তালিকা `docs/SECURITY.md`)। (৩) পাবলিক endpoint ছাত্রের কোনো তথ্য ফেরত দেয় না। (৪) `ip_hash` — মূল IP নয়। (৫) তথ্যের ন্যূনতম সংগ্রহ: ধর্ম, রক্তের গ্রুপ ঐচ্ছিক ক্ষেত্র; ফর্মে "ঐচ্ছিক" লেবেল। (৬) ডেটাবেস/ব্যাকআপ-এ `at-rest` এনক্রিপশন (VPS ডিস্ক বা managed DB-র সুবিধা) ও ট্রানজিটে TLS।

## 3. সম্মতি (Consent) — `consents` টেবিল
চার ধরন (`consents.type`): `data_processing` (প্রতিষ্ঠান সন্তানের তথ্য রাখবে/প্রক্রিয়া করবে), `sms` (অভিভাবকের ফোনে বিজ্ঞপ্তি), `health_data` (স্বাস্থ্য রেকর্ড রাখা), `photo` (ছবি — ID কার্ড/অভ্যন্তরীণ ব্যবহারের বাইরে প্রকাশ্য ব্যবহারের জন্য আলাদা, ডিফল্ট না-দেওয়া)।

| কোথায় নেওয়া হয় | পদ্ধতি (`method`) | নিয়ম |
|---|---|---|
| ভর্তির ফর্ম (admin) | `paper` | Admin "অভিভাবকের সম্মতি-পত্র সংগৃহীত" টিক দেয়; `recorded_by` = সে; কাগজের স্ক্যান ঐচ্ছিক (`student_documents`) |
| অভিভাবকের প্রথম লগইন | `portal` | পূর্ণ-পর্দা "গোপনীয়তা ও সম্মতি" — যতক্ষণ `data_processing` দেননি পোর্টালে ঢোকা যাবে না (অন্য ফিচার আটকে থাকে, ফি-র বকেয়া দেখা যায়) |
| পাবলিক ভর্তি-আবেদন ফর্ম | `public_form` | বাধ্যতামূলক চেকবক্স ("আমি গোপনীয়তা নীতি পড়েছি; যোগাযোগের জন্য আমার ফোন ব্যবহারে সম্মত") — `admission_leads.consented_at`; না টিকালে ফর্ম জমা হয় না |
| SMS বন্ধ চাইলে | `portal`/`otp` | অভিভাবক সেটিংসে "SMS বন্ধ" → `consents(type=sms, status=revoked)` |
- **ডিফল্ট ও অগ্রাধিকার:** `sms` — ভর্তি-সম্মতির অংশ হিসেবে `granted`; অভিভাবক বন্ধ করলে `revoked` এবং **সেই ফোন নম্বর** (`consents.guardian_phone`) থেকে কোনো প্রচারমূলক/স্মারক SMS যায় না। *লেনদেন-সংক্রান্ত* SMS (পেমেন্ট রসিদ, OTP, পাসওয়ার্ড-রিসেট) সম্মতি-নিরপেক্ষ, কারণ সেবার অংশ — আইনজীবীর সঙ্গে নিশ্চিত করুন।
- `SmsService::send()` প্রতিটি non-transactional SMS-এর আগে `ConsentService::allowsSms($phone)` যাচাই করে (`consents` ইনডেক্স `idx_consents_phone`)।
- নাবালকের সম্মতি অভিভাবকের; ১৮+ কলেজ ছাত্রের ক্ষেত্রে (`date_of_birth` থেকে) সে নিজেই সম্মতিদাতা — UI-তে "অভিভাবক/ছাত্র" লেবেল জন্মতারিখ অনুযায়ী (আইনি বয়স আইনজীবীর কাছে নিশ্চিত করুন)।
- সম্মতির ইতিহাস: প্রতিটি পরিবর্তন `audit_logs`-এ (`consent.granted/revoked`)।

```php
// app/Services/ConsentService.php
class ConsentService
{
    public function record(Student $s, string $type, string $method, array $guardian = [], ?int $by = null): Consent
    {
        return Consent::updateOrCreate(['student_id' => $s->id, 'type' => $type], [
            'status' => 'granted', 'method' => $method, 'recorded_by' => $by, 'granted_at' => now(), 'revoked_at' => null,
            'guardian_name' => $guardian['name'] ?? null, 'guardian_phone' => $guardian['phone'] ?? $s->guardian_phone,
        ]);                                                    // + AuditLog::record('consent.granted', ...)
    }
    public function revoke(Student $s, string $type): void { Consent::where('student_id', $s->id)->where('type', $type)->update(['status' => 'revoked', 'revoked_at' => now()]); }
    public function allowsSms(string $phone): bool           // false if ANY student linked to this guardian phone revoked sms
    {
        return !Consent::where('guardian_phone', $phone)->where('type', 'sms')->where('status', 'revoked')->exists();
    }
    public function hasDataConsent(Student $s): bool { return Consent::where('student_id', $s->id)->where('type', 'data_processing')->where('status', 'granted')->exists(); }
}
```
**API:** `GET /students/{id}/consents` [admin]; `POST /students/{id}/consents` { type, method: paper, guardian_name } [admin]; `GET /parent/consents` / `PUT /parent/consents/{type}` { status } [parent, নিজের সন্তান]; আবেদন-ফর্মে `consent: true` (validation `accepted`)। **UI:** ভর্তির ফর্মের নিচে "সম্মতি" অংশ; Student profile-এ "সম্মতি" ট্যাব (অবস্থা + তারিখ + পদ্ধতি); অভিভাবক প্যানেলে "আমার সম্মতি"।
**বাধা নয় (নির্দেশক):** সম্মতি না থাকলে student তৈরি *আটকানো হয় না* (প্রতিষ্ঠান কাগজ পরে তুলতে পারে) — কিন্তু Dashboard-এ "সম্মতি অনুপস্থিত" সংখ্যা-কার্ড, আর Phase 8-এ বাধ্যতামূলক করার সুইচ `settings.require_consent` (default false)।

## 4. সংরক্ষণ ও মেয়াদ (Retention)
| তথ্য | সংরক্ষণ | মেয়াদ-শেষে | কে ঠিক করে |
|---|---|---|---|
| সক্রিয় ছাত্র/অভিভাবক | যতদিন ভর্তি | — | প্রতিষ্ঠান |
| প্রাক্তন ছাত্র (`graduated/transferred/dropped`) — একাডেমিক ফলাফল, TC, সনদ | **প্রতিষ্ঠান ঠিক করে** (শিক্ষা-নথি সাধারণত দীর্ঘদিন রাখতে হয় — আইনজীবীর/শিক্ষা বোর্ডের নিয়ম দেখুন) | ব্যক্তিগত অংশ বেনামি (§5) | প্রতিষ্ঠান |
| স্বাস্থ্য ও আচরণ রেকর্ড | ছাত্র চলে যাওয়ার **১ বছর** পর (প্রস্তাব, যাচাই করুন) | স্থায়ী মোছা | প্রতিষ্ঠান (সেটিংস) |
| ভর্তি-আবেদন (`admission_leads`) যা ভর্তিতে রূপান্তর হয়নি | **১২ মাস** | মোছা | স্বয়ংক্রিয় (`leads:purge`) |
| SMS লগ (`sms_logs`) | ১৮০ দিন (message body ৯০ দিন পর `NULL`) | মোছা/সংক্ষিপ্ত | স্বয়ংক্রিয় |
| Audit log | ২ বছর (ঘটনা তদন্ত) | মোছা | স্বয়ংক্রিয় |
| অনলাইন পেমেন্ট ও রসিদ | **আর্থিক নথি হিসেবে** — কর/হিসাবের আইন অনুযায়ী (সাধারণত বহু বছর; আইনজীবী/হিসাবরক্ষক নিশ্চিত করুন) | বেনামি হয়, মোছা হয় না | আইন |
| ব্যাকআপ | ৩০ দিন rolling | স্বয়ংক্রিয় ঝরে পড়ে | প্ল্যাটফর্ম |
| সক্রিয় নয় এমন প্রতিষ্ঠান (সাবস্ক্রিপশন বাতিল) | বাতিলের ৩০ দিন পর্যন্ত রপ্তানি-সুযোগ, তারপর ৩০ দিন suspended, মোট ~৬০ দিনে মোছা | `tenant:purge` (§5.3) | প্ল্যাটফর্ম, ToS অনুযায়ী |
Scheduler: `leads:purge` (সাপ্তাহিক), `sms:trim` (দৈনিক), `audit:trim` (সাপ্তাহিক), `tenants:purge-due` (দৈনিক — শুধু draft তালিকা তৈরি করে Super Admin-কে জানায়; **মোছা সবসময় ম্যানুয়াল অনুমোদনে**)। সব `Tenancy::each()`/`withoutTenancy()` নিয়মে।

## 5. মুছে ফেলা ও বেনামিকরণ (Erasure)
### 5.1 একজন ছাত্র — `StudentErasureService`
অনুরোধ: অভিভাবক/ছাত্র প্রতিষ্ঠানকে জানায় (কাগজে বা পোর্টালে "তথ্য মুছুন" অনুরোধ → `erasure_requested` নোটিশ Admin-কে)। **প্রতিষ্ঠানই সিদ্ধান্ত নেয়** (কারণ কিছু নথি আইনত রাখতে হয়)। সম্মতি হলে Admin "বেনামি করুন" চালায়:
```php
public function anonymize(Student $s, int $by): void
{
    DB::transaction(function () use ($s, $by) {
        $s->forceFill([
            'father_name' => null, 'mother_name' => null, 'address' => null, 'guardian_phone' => '00000000000',
            'date_of_birth' => null, 'blood_group' => null, 'religion' => null, 'photo' => null, 'studying_at' => null,
            'board_reg_no' => null, 'board_roll_no' => null, 'status' => 'inactive', 'anonymized_at' => now(),
        ])->save();
        $s->user?->forceFill(['name' => 'Anonymized #' . $s->id, 'email' => null, 'phone' => null, 'username' => 'anon-' . $s->id, 'avatar' => null, 'is_active' => 0, 'password' => bcrypt(Str::random(40))])->save();
        app(TokenService::class)->revokeAll($s->user);
        Storage::disk('private')->deleteDirectory("institutions/{$s->institution_id}/students/{$s->id}");   // photo + documents
        $s->documents()->delete(); HealthRecord::where('student_id', $s->id)->delete(); BehaviorLog::where('student_id', $s->id)->delete();
        Consent::where('student_id', $s->id)->delete();
        // KEPT on purpose: enrollments, attendances, results, fee_payments (the institution's academic & financial records) - now unlinked from any identity
        AuditLog::record('student.anonymized', $s, ['by' => $by]);                                           // the audit row itself holds no personal data
    });
}
```
- **অভিভাবকের লিংক:** `parent_student` সংযোগ মুছে যায়; অভিভাবক-user অন্য সন্তান না থাকলে নিষ্ক্রিয় ও বেনামি।
- **ফেরানো যায় না।** UI-তে দ্বি-ধাপ নিশ্চিতকরণ (নাম টাইপ করে)।
- হার্ড-ডিলিট (`DELETE /students/{id}/force`) শুধু Super Admin — এটি শুধু ভুলে-তৈরি রেকর্ডের জন্য; ফি/ফলাফল থাকলে 422, `anonymize` ব্যবহার করুন।
### 5.2 তথ্য রপ্তানি (Access / Portability)
প্রতিষ্ঠানের জন্য: বিদ্যমান "Full Data Export" (`docs/modules/advanced-features.md` #6)। অভিভাবকের জন্য: `GET /parent/children/{id}/export` — সন্তানের প্রোফাইল, হাজিরা, ফলাফল, ফি, সম্মতি — PDF/JSON (admin অনুমোদন ছাড়া সরাসরি, কারণ নিজের সন্তানের তথ্য)। রপ্তানি `audit_logs`-এ।
### 5.3 প্রতিষ্ঠান বন্ধ — `tenant:purge`
```
1. Super Admin "মোছার প্রক্রিয়া শুরু" (শর্ত: status=suspended/expired >= 30 দিন + একটি সম্পূর্ণ export তৈরি ও প্রতিষ্ঠানকে ডাউনলোড-লিংক পাঠানো হয়েছে)
2. dry-run: প্রতিটি tenant-scoped টেবিলের সারি-সংখ্যা তালিকা (Tenancy::as); সম্মতি-প্রমাণ (Super Admin-এর লিখিত নিশ্চিতকরণ audit-এ)
3. মোছা: FK-ক্রম অনুযায়ী (শিশু-টেবিল আগে), শেষে institutions row; storage "institutions/{id}/" পুরোটা; Redis cache keys `*:{id}`; domain-গুলো disabled ও Caddy cert রিনিউ বন্ধ
4. যাচাই: প্রতিটি টেবিলে institution_id = {id} এর সংখ্যা ০; storage খালি; অডিট-সারাংশ (সংখ্যা, তারিখ, কে) `platform_audit` log-এ — কোনো ব্যক্তিগত তথ্য নয়
5. ব্যাকআপে থাকা কপি স্বাভাবিক নিয়মে ৩০ দিনে ঝরে পড়ে (ToS-এ উল্লেখ)
```
ক্রম তালিকা `tests/Architecture/purge-order.php`-এ; `TenantPurgeTest` প্রতিটি `institution_id`-ওয়ালা টেবিল আচ্ছাদিত কিনা যাচাই করে (নতুন টেবিল যোগ করলে ভুলে বাদ পড়া আটকায়)।
### 5.4 সীমাবদ্ধতা (সৎভাবে)
সব এক ডেটাবেসে, তাই **একটি প্রতিষ্ঠানের ডেটা আলাদা করে ফেরানো (restore)** সরাসরি সম্ভব নয়; backup থেকে পুরো ডেটাবেস অন্য জায়গায় তুলে সেই প্রতিষ্ঠানের সারি export-import করতে হয়। Phase 9-এ সেই কর্মপ্রণালী লেখা ও একবার মহড়া করা (`docs/ops/`), নইলে এটি "ক্ষমতা আছে" নয়, "আছে বলে ধারণা"।

## 6. উপ-প্রক্রিয়াকারী ও বাইরে যায় যা
| সেবা | কী যায় | নোট |
|---|---|---|
| SMS gateway (SSL Wireless) | ফোন নম্বর, message | message-এ ন্যূনতম তথ্য (পূর্ণ নাম/স্বাস্থ্য নয়) |
| পেমেন্ট gateway (bKash/SSLCommerz) | অঙ্ক, রেফারেন্স, (SSLCommerz-এ) নাম/ফোন/ইমেইল | `create()` শুধু প্রয়োজনীয় ক্ষেত্র পাঠায় |
| ক্লাউড স্টোরেজ/হোস্টিং | সব সংরক্ষিত ডেটা | ডেটা কোন দেশে থাকে তা তালিকাভুক্ত করুন (আইনজীবী: দেশের বাইরে তথ্য পাঠানোর নিয়ম) |
| ইমেইল (SMTP) | ইমেইল ঠিকানা, মূল বার্তা | |
| Sentry | ত্রুটির প্রেক্ষাপট | scrub করা; PII নয় |
| Firebase (push, Phase 10) | device token | |
এই তালিকা Privacy Policy-র অংশ হিসেবে প্রকাশ্য (§8) এবং নতুন সেবা যোগ হলে হালনাগাদ।

## 7. ঘটনা-ব্যবস্থাপনা (Breach)
ফাঁস সন্দেহ হলে: (১) token বাতিল (সব বা প্রভাবিত), (২) প্রভাবিত প্রতিষ্ঠান ও তালিকা নির্ধারণ (`audit_logs`, `sessions`), (৩) প্রতিষ্ঠানকে অবিলম্বে জানানো (controller হিসেবে তাদের দায় আছে), (৪) আইনি বাধ্যবাধকতা অনুযায়ী কর্তৃপক্ষকে জানানোর সময়সীমা (**আইনজীবীর কাছে নিশ্চিত করুন; আমি সংখ্যা জানি না**), (৫) পোস্ট-মর্টেম। `docs/INCIDENT-RUNBOOK.md`-এ এক পাতার তালিকা (কে কাকে ফোন করে) Phase 8-এ।

## 8. খসড়া নথি (পাবলিক পাতায় যাবে — আইনজীবীর যাচাই আবশ্যক)
সবগুলো `/privacy` ও `/terms` পাতা (`PublicLayout`, বাংলা + ইংরেজি, সব host-এ; প্রতিষ্ঠানের নাম পরিবর্তনশীল `{{institution_name}}`)। প্রতিষ্ঠান-স্তরের Privacy Policy প্রতিষ্ঠান নিজে সম্পাদনা করতে পারে (`settings.privacy_policy_extra`), মূল কাঠামো প্ল্যাটফর্মের।

### 8.1 Privacy Policy — খসড়া কাঠামো
1. **আমরা কারা:** `{{institution_name}}` (তথ্য সংগ্রাহক), সফটওয়্যার সরবরাহকারী `{{platform_name}}` (প্রক্রিয়াকারী)। যোগাযোগ: `{{contact}}`।
2. **কোন তথ্য রাখি:** §2 তালিকা (সাদা ভাষায়) — ছাত্রের নাম, জন্মতারিখ, ছবি; অভিভাবকের ফোন; হাজিরা, ফলাফল, ফি; (প্রযোজ্য হলে) স্বাস্থ্য ও আচরণ।
3. **কেন রাখি:** ভর্তি ও শিক্ষা পরিচালনা; ফি আদায়; অভিভাবককে বিজ্ঞপ্তি; আইনি বাধ্যবাধকতা। *বিজ্ঞাপন বা বিক্রির জন্য নয়।*
4. **কার সঙ্গে ভাগ করি:** §6 তালিকা; শিক্ষক শুধু নিজের শ্রেণির ছাত্রদের তথ্য দেখেন।
5. **কতদিন রাখি:** §4 সারণি।
6. **আপনার অধিকার:** দেখা (রপ্তানি), সংশোধন, SMS বন্ধ, সম্মতি তুলে নেওয়া, মুছে ফেলার অনুরোধ (প্রতিষ্ঠানের মাধ্যমে; আইনত রাখতে হয় এমন নথি বাদে)।
7. **নিরাপত্তা:** এনক্রিপ্টেড সংযোগ, প্রবেশাধিকার-নিয়ন্ত্রণ, লগ।
8. **শিশু:** ১৮-র নিচের ছাত্রের তথ্য অভিভাবকের সম্মতিতে।
9. **পরিবর্তন:** তারিখসহ সংস্করণ; বড় পরিবর্তনে অভিভাবককে জানানো।
10. **অভিযোগ:** প্রথমে প্রতিষ্ঠান, তারপর `{{platform_contact}}`।

### 8.2 Terms of Service (প্রতিষ্ঠান ↔ প্ল্যাটফর্ম) — খসড়া কাঠামো
সেবার বিবরণ ও প্ল্যান; পেমেন্ট ও নবায়ন (trial, grace, suspend); **ডেটার মালিকানা: প্রতিষ্ঠানের**; **প্রক্রিয়াকরণ শর্ত** (শুধু প্রতিষ্ঠানের নির্দেশে; উপ-প্রক্রিয়াকারী তালিকা; নিরাপত্তা; ঘটনা জানানো; মোছা — §4–5, ৩০/৩০/৩০ দিনের সময়রেখা); গ্রহণযোগ্য ব্যবহার (শিশুর তথ্য অপব্যবহার নিষেধ); SMS ব্যবহার ও masking ID দায়; **অনলাইন ফি সংগ্রহ** (প্রতিষ্ঠানের নিজস্ব gateway হলে তারা নিজে দায়ী; প্ল্যাটফর্ম-মোডে settlement শর্ত, ফি, সময়, বিরোধ — `online-fee-payment.md`); সেবার সীমাবদ্ধতা/ক্ষতিপূরণ-সীমা; পরিষেবা বন্ধ করা; প্রযোজ্য আইন ও বিরোধ-নিষ্পত্তি (`{{আইনজীবী}}`)।

### 8.3 অভিভাবকের সম্মতি-পত্র (কাগজ, A4 এক পাতা) — খসড়া
"আমি `{{guardian_name}}`, `{{student_name}}`-এর অভিভাবক, নিচের বিষয়ে সম্মতি দিচ্ছি: (ক) ভর্তি ও শিক্ষা-পরিচালনার জন্য আমার সন্তানের তথ্য রাখা ☐ (খ) আমার ফোনে SMS ☐ (গ) স্বাস্থ্য-তথ্য রাখা ☐ (ঘ) ID কার্ডের ছবি ☐ (ঙ) প্রতিষ্ঠানের প্রচারে ছবি ব্যবহার ☐ (ঐচ্ছিক)। আমি গোপনীয়তা নীতি পড়েছি এবং যেকোনো সময় সম্মতি তুলে নিতে পারি।" — স্বাক্ষর, তারিখ। (সিস্টেম এই পত্রের PDF তৈরি করে: `GET /students/{id}/consent-form.pdf`।)

## 9. কাজের তালিকা (Build Steps-এ বসানো)
| কোথায় | কী |
|---|---|
| Step 2.3 (Auth) | `TokenService`, মেয়াদ/idle, session API, password policy, lockout (`docs/AUTHORIZATION.md`) |
| Step 4.2 (Students) | `ConsentService`, ভর্তি-ফর্মে সম্মতি, Student profile "সম্মতি" ট্যাব, `consent-form.pdf` |
| Step 4.6 (SMS) | `SmsService` → `allowsSms()`; লেনদেন/প্রচারমূলক বিভাজন; `sms:trim` |
| Step 4.7 (Parent panel) | প্রথম লগইনে সম্মতি-পর্দা, "আমার সম্মতি", সন্তানের রপ্তানি |
| Step 5.1 (Signup) | ToS + Privacy সম্মতি চেকবক্স; `/privacy`, `/terms` পাতা |
| Step 6.4 (Public site) | আবেদন-ফর্মে সম্মতি চেকবক্স (`consented_at`), `leads:purge` |
| Phase 8 | `StudentErasureService`, `tenant:purge`, রপ্তানি, retention scheduler, incident runbook, restore মহড়া |
**Done When (Phase 8):** `StudentErasureTest` (বেনামির পর কোথাও নাম/ফোন/ছবি নেই, ফলাফল/ফি আছে, অভিভাবক-লিংক নেই, token বাতিল); `ConsentTest` (SMS বন্ধ = প্রচারমূলক SMS যায় না, রসিদ-SMS যায়); `TenantPurgeTest`; `RetentionTest`; `PrivateFileAccessTest` (ছাত্রের ছবি বিনা-signature-এ 403, অন্য প্রতিষ্ঠানের signed URL কাজ করে না)।
