# Security & Permission Matrix

## Permission Matrix
| Module | Super | Admin | Teacher | Student | Parent | Accountant |
|--------|-------|-------|---------|---------|--------|------------|
| Student Management | — | CRUD | R | R | R(own) | — |
| Exam Creation | — | CRUD | — | — | — | — |
| Mark Entry | — | CRU | CRU | — | — | — |
| View Results | — | Yes | Yes | R(own) | R(child) | — |
| Attendance Entry | — | CRU | CRU | — | — | — |
| Fee Collection | — | Yes | — | — | Pay | CRUD |
| HR & Salary | — | Yes | — | — | — | CRUD |
| Expense Entry | — | CRUD | — | — | — | CRUD |
| Exam Seat Plan | — | CRUD | R | R(own) | R(child) | — |
| Audit Log | Yes | R (own institution) | — | — | — | — |
| Institution Settings | Yes | CRUD | — | — | — | — |
| Subscription | CRUD | R | — | — | — | — |

> **Revision 10 — Super Admin কলামের অর্থ:** Super Admin = *প্ল্যাটফর্ম-পরিচালক*। সে প্রতিষ্ঠানের **সমষ্টি-তথ্য** (সংখ্যা, প্ল্যান, বিল, অবস্থা) দেখে, কিন্তু ছাত্র, পরীক্ষা, ফি, বেতনের মতো **পরিচালনাগত ডেটা** নয় (D25, D33)। সাপোর্টের জন্য ঢুকতে হলে শুধু প্রতিষ্ঠানের অনুমতিসহ, সময়-সীমিত, read-only, audit-সহ impersonation (`docs/modules/platform-ops.md`)। উপরের মূল matrix-এর পুরনো "Super: CRUD" সারিগুলো এই নীতিতে সংশোধিত।

## Security Checklist
- ✅ Sanctum Token Auth (Bearer) — **মেয়াদ role-ভেদে** (absolute + idle), সর্বোচ্চ ৫ token, জোর-বাতিল: `docs/AUTHORIZATION.md` Token Strategy (D26); আগের "৭ দিন" বাতিল
- ✅ Tenant Isolation (Global Scope)
- ✅ Input Validation (FormRequest)
- ✅ Password: bcrypt; **role-ভিত্তিক নীতি** (super_admin ১২, admin/accountant ১০, teacher ৮, student/parent ৬ অক্ষর; নাম/ফোন/ID-ধারণকারী ও সাধারণ-তালিকা অগ্রাহ্য): `docs/AUTHORIZATION.md` Password Policy
- ✅ CORS: specific domain only
- ⚠️ Rate Limiting: Login 5/min, API 60/min
- ⚠️ Audit Log: Delete, Payment, Publish
- ⚠️ File Upload: ছবি `jpeg/png` ≤ 2 MB; নথি `pdf/jpg/png` ≤ 5 MB; ছাত্রের ছবি/নথি **private disk + temporary URL**; Excel import ≤ 2 MB (sync)/5 MB (queue)

## Rate Limiting
```php
RateLimiter::for('login', fn() => Limit::perMinute(5)->by(request()->ip()));
RateLimiter::for('api', fn() => Limit::perMinute(60)->by(auth()->id() ?? request()->ip()));
```

## Audit Log Table
- institution_id, user_id, action, model, model_id, old_data, new_data, ip_address
```php
AuditLog::record('result.publish', $exam);
```

## File Upload Security
```php
// Http/Requests/UploadRequest.php
'photo' => 'nullable|image|mimes:jpeg,png,jpg|max:2048',
'document' => 'nullable|mimes:pdf,jpg,jpeg,png|max:5120',

// Controller — safe filename
$filename = 'photo-' . Str::uuid() . '.' . $file->extension();      // extension() comes from the sniffed MIME type; getClientOriginalExtension() is attacker-controlled
$path = $file->storeAs("institutions/{$student->institution_id}/students/{$student->id}", $filename, 'private');   // under students/{sid}/ so erasure deletes it (docs/architecture/file-storage.md)
// Never keep the original filename (XSS risk)
```

## CORS Configuration
```php
// config/cors.php
'allowed_origins' => [
    'https://*.schoolapp.com',
    'https://schoolapp.com',
],
'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
'allowed_headers' => ['Content-Type', 'Authorization', 'Accept-Language'],
```

## SQL Injection Prevention
```php
// ✅ Eloquent — safe
Student::where('name', $name)->get();

// ✅ Parameterized — safe
DB::select('SELECT * FROM students WHERE institution_id = ?', [$institutionId]);

// ❌ Never do this
DB::select("SELECT * FROM students WHERE name = '{$name}'");
```

## XSS Prevention
```php
// Laravel Blade auto-escapes: {{ $variable }}
// React JSX auto-escapes: {variable}
// Dangerous: {!! $html !!} or dangerouslySetInnerHTML — avoid
```

## Sensitive Data Masking (API Response)
```php
// StudentResource — never expose password, institution_id, or token
class StudentResource extends JsonResource {
    public function toArray($request) {
        return [
            'id'           => $this->id,
            'student_id'   => $this->student_id,
            'name'         => $this->name,
            // 'password'  → never!
            // 'institution_id' → never!
        ];
    }
}
```

---

## Updated Permission Matrix (Revision 4)

### New Module Permissions
| Module | Admin | Teacher | Student | Parent | Accountant |
|--------|-------|---------|---------|--------|------------|
| Online Exam Create | CRUD | CRU | Take only | — | — |
| Homework Submit | — | — | Submit | — | — |
| Homework Grade | — | Grade | — | — | — |
| Behavior Log | CRUD | Create | Read own | Read child | — |
| Health Record | CRUD | Read | Read own | Read child | — |
| Certificate | CRUD | — | Download own | Download child | — |
| Visitor Log | CRUD | — | — | — | — |
| Alumni | CRUD | — | Register | — | — |
| Fee Installment | CRUD | — | — | View own | CRUD |
| Meeting Schedule | CRUD | CRUD | — | Confirm | — |
| Multi-Branch | HO Admin | — | — | — | HO Accountant |
| Per-Institution Theme (own institution) | CRUD (Pro+) | — | — | — | — |
| Per-Institution Theme (any institution) | Super CRUD | — | — | — | — |

*HO = Head Office only*

---

## Revision 6.2 — Money & Secrets
| Module | Super | Admin | Teacher | Student | Parent | Accountant |
|--------|-------|-------|---------|---------|--------|------------|
| Gateway credentials (write) | — | CRUD (password re-check) | — | — | — | — |
| Gateway credentials (read) | never | never (masked hint only) | — | — | — | — |
| Payout account | Verify | CRU | — | — | — | R |
| Online payments list | R (all) | R | — | — | R(own) | R |
| Settlements | CRUD + approve + pay | R | — | — | — | R |
| Pay fees online | — | — | — | — | Pay | — |
| SMS sender ID | Approve/Reject | Submit | — | — | — | — |
| Public website settings | — | CRUD | — | — | — | — |

- Gateway credentials ও payout account number: Eloquent `encrypted` cast; log/Sentry/response-এ কখনো নয়; `APP_KEY` rotate = `payments:reencrypt` আবশ্যক।
- Public endpoints (`/public/*`, `/`, `/robots.txt`): কোনো Student/ফি/ফলাফল ডেটা নয়; `/bootstrap` শুধু allow-listed settings; admission ফর্মে honeypot + rate limit; raw IP সংরক্ষিত নয় (hash)।
- Public text কখনো HTML হিসেবে render হয় না (`dangerouslySetInnerHTML` নিষেধ — CI grep)।

---

## Revision 7 — Sessions, Files, Children's Data
| Module | Super | Admin | Teacher | Student | Parent | Accountant |
|--------|-------|-------|---------|---------|--------|------------|
| Own sessions / logout-all | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Force-logout / unlock a user | — | own institution | — | — | — | — |
| Student consents | — | CRU | R (own batch) | — | R/U own children | R |
| Anonymize a student | — | ✅ (typed confirmation) | — | — | request only | — |
| Tenant purge | ✅ (dry-run + typed confirmation, manual) | — | — | — | — | — |
| Child data export | — | ✅ | — | — | own child | — |
- **Private files:** student photos and documents use the private disk and `temporaryUrl()` (5–10 min); `Storage::disk('public')->url()` only for logos / hero images. `PrivateFileAccessTest`.
- **Log hygiene:** no phone, full name, health/behaviour text, message body or credential in logs, Sentry or `failed_jobs` payloads (the `failed()` handler logs a masked phone only). `failed_jobs` stores the serialized job: sensitive free text should not be put in job properties - pass an id and load inside `handle()`.
- **Full spec:** `docs/legal/privacy-and-consent.md`. Legal wording and retention periods are unverified until a lawyer confirms them.

---

## Revision 10 — Permission Matrix: Advanced Academics, Staff & Payroll
(`—` = কোনো অ্যাক্সেস নয়; R/C/U/D = পড়া/তৈরি/বদল/মুছা; ব্র্যাকেট = শর্ত। Contract test-fixture `tests/Fixtures/role-matrix.php` এই সারণি থেকে বানানো হয় — `RoleMatrixContractTest`)
| Module / action | Super | Admin | Teacher | Student | Parent | Accountant |
|---|---|---|---|---|---|---|
| Result sheets (তৈরি/compute) | — | CRUD | R + preview (নিজের batch) | — | — | — |
| Result sheet publish / new-version | — | ✅ | — | — | — | — |
| Final results দেখা | — | R | R (নিজের batch) | R (own, প্রকাশিত) | R (child, প্রকাশিত) | — |
| Due-block exemptions | — | CRUD | — | — | — | CRUD |
| Period attendance | — | R | CRU (নিজের period / বদলি) | R (own) | R (child) | — |
| Substitutions | — | CRUD | গ্রহণ (নিজের) | — | — | — |
| Routine blocks | — | CRUD | R | R | R | — |
| Student leave requests | — | approve/reject | approve (নিজের batch) | C (১৮+) + R own | C + R (child) | — |
| Marks submit / unlock | — | unlock | submit (নিজের বিষয়) | — | — | — |
| Staff members | — | CRUD | — | — | — | CRU |
| Salary components | — | CRUD | — | — | — | R |
| Salary structure / revisions | — | CRUD + approve | R (own) | — | — | C (প্রস্তাব) + R |
| Increment batches | — | C + approve | — | — | — | C (প্রস্তাব) |
| Bonus schemes | — | CRUD + apply | — | — | — | preview |
| Salary adjustments | — | CRUD + approve | R (own) | — | — | CRU (নিজেরটা approve নয়) |
| Advances | — | approve / disburse | request + R (own) | — | — | CRU (disburse) |
| Payroll runs | — | approve / pay | R (own slip) | — | — | prepare / pay (নিজের prepared run approve নয়) |
| Pay accounts | — | CRU | R (own, মাস্ক) | — | — | CRU |
| Provident fund | — | CRUD | R (own) | — | — | R |
**Super Admin কলাম পুরোটাই `—`:** বেতন ও একাডেমিক ডেটা প্ল্যাটফর্মের আওতার বাইরে (D33); impersonation-এও 403 `sensitive_scope` (payroll)।

---

## Revision 12 — Permission Matrix: finance, store, devices, accounting, donations, madrasa, syllabus, risk, admission, imports, communication, support
(`—` = কোনো অ্যাক্সেস নয়। `tests/Fixtures/role-matrix.php` এই সারণি থেকে বানানো — `RoleMatrixContractTest`। **Super Admin কলাম ইচ্ছাকৃতভাবে প্রায় সব `—`**: প্ল্যাটফর্ম আর্থিক/শিক্ষা-পরিচালনার ডেটা দেখে না (D33); সাপোর্টে শুধু টিকিট-grant সহ read-only impersonation এবং তখনও সংবেদনশীল স্কোপ বাদ — D34)
| Module / action | Super | Admin | Teacher | Student | Parent | Accountant |
|---|---|---|---|---|---|---|
| Cash book (দেখা/close) | — | ✅ | — | — | — | ✅ (close) |
| Cash book reopen | — | ✅ | — | — | — | — |
| Fee refunds (অনুরোধ/process) | — | approve + process | — | — | — | request + process (নিজেরটা approve নয়) |
| Inventory | — | CRUD | — | — | — | CRU + sale |
| Attendance devices / credentials | — | CRUD | — | — | — | — |
| Device punches (পর্যালোচনা) | — | ✅ | — | — | — | — |
| Accounting (ভাউচার/চার্ট/বাজেট) | — | ✅ + reverse | — | — | — | ✅ (নিজের voucher reverse নয়) |
| Donations / donors / funds | — | CRUD | — | — | — | CRU |
| Hifz records | — | CRUD | CRUD (নিজের batch) | — | R (child, সেটিং চালু) | — |
| Syllabus units / coverage | — | CRUD | CRU (নিজের বিষয়/batch) | R (সেটিং চালু) | R (child, সেটিং চালু) | — |
| Risk flags | — | R + settings | R + acknowledge (নিজের batch) | — | — | — |
| Admission cycles / lists / lottery | — | CRUD | — | — | — | — |
| Data imports | — | ✅ | — | — | — | — |
| SMS templates / campaigns | — | ✅ | — | — | — | ফি-স্মারক শুধু |
| Emergency alert | — | ✅ | — | — | — | — |
| Notice acknowledge | — | R receipts | R receipts (নিজের নোটিশ) | ack (own) | ack (own) | — |
| Support tickets (প্রতিষ্ঠানের) | R + reply (সব) | CRU (নিজের প্রতিষ্ঠান) | — | — | — | — |
| Tenant export | — (শুধু `backup` + কারণ, payroll বাদ) | request + download | — | — | — | — |
| Impersonation | start (টিকিট-grant সহ) | grant / revoke | — | — | — | — |
| Coupons / platform settings | CRUD | R (coupon validate) | — | — | — | — |
| Certificate / TC verify (পাবলিক) | — | — | — | — | — | — (সবার জন্য খোলা, ন্যূনতম তথ্য) |
**নোট:** Teacher-এর "নিজের batch/বিষয়" `batch_teachers`/`teacher_subjects` থেকে policy-তে; কোনো route শুধু role দেখে ছাড় দেয় না।
