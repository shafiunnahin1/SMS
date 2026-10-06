# File Storage — দুটি ডিস্ক, একটি পাথ-নিয়ম, একাধিক সার্ভারে নিরাপদ (Revision 15, D40)

> **কেন এই ফাইল:** যাচাইয়ে ফাইল-সংরক্ষণে চারটি বাস্তব ত্রুটি পাওয়া গেছে: (১) ID-কার্ড PDF-এর পাথ `id-cards/bulk-<timestamp>.pdf` — প্রতিষ্ঠানের নাম নেই, তাই একই সেকেন্ডে দুই প্রতিষ্ঠান বানালে একজনের ফাইল অন্যের উপর পড়ে (শিশুদের ডেটা ভুল প্রতিষ্ঠানে); (২) ছাত্রের ছবি `students/photos/<uuid>`-এ, অথচ "মুছে ফেলার অধিকার" মোছে `institutions/{id}/students/{sid}/` — **মুছলেও ছবি থেকে যেত**; (৩) সনদ-PDF ডিফল্ট `s3` ডিস্কে (ব্যক্তিগত তথ্য, দৃশ্যমানতা অনির্দিষ্ট); (৪) `config/filesystems.php`-ই সংজ্ঞায়িত ছিল না, `s3_private` ডিস্কের নাম শুধু .env-এ। (একাধিক সার্ভারে ফাইল ভাঙার ঝুঁকি আমি আগে ভুল বলেছিলাম — প্ল্যান S3-ধরনের ডিস্ক আগেই চেয়েছিল; আসল ফাঁক ছিল ওপরের চারটি।)
> কোড-ডিস্ক-নাম মাত্র দুটি: **`private`** ও **`public`**। কোড কখনো `'s3'`, `'local'`, `storage_path()`, `public_path()` সরাসরি লেখে না।

## ১. ডিস্ক-সংজ্ঞা (`config/filesystems.php`)
```php
// FILES_DRIVER = local (dev / one server)  |  s3 (any S3-compatible store: AWS S3, MinIO, a local provider) - the ONLY switch between one server and many
'default' => 'private',
'disks' => [
    'private' => env('FILES_DRIVER', 'local') === 's3'
        ? ['driver' => 's3', 'key' => env('S3_KEY'), 'secret' => env('S3_SECRET'), 'region' => env('S3_REGION', 'us-east-1'),
           'bucket' => env('S3_PRIVATE_BUCKET'), 'endpoint' => env('S3_ENDPOINT'), 'use_path_style_endpoint' => env('S3_PATH_STYLE', true),
           'visibility' => 'private', 'throw' => true]
        : ['driver' => 'local', 'root' => storage_path('app/private'), 'visibility' => 'private',
           'serve' => true, 'throw' => true],            // 'serve' gives signed temporaryUrl() on a local disk - check your Laravel 11 minor version supports it
    'public' => env('FILES_DRIVER', 'local') === 's3'
        ? ['driver' => 's3', 'key' => env('S3_KEY'), 'secret' => env('S3_SECRET'), 'region' => env('S3_REGION', 'us-east-1'),
           'bucket' => env('S3_PUBLIC_BUCKET'), 'endpoint' => env('S3_ENDPOINT'), 'use_path_style_endpoint' => env('S3_PATH_STYLE', true),
           'url' => env('PUBLIC_FILES_URL'), 'visibility' => 'public', 'throw' => true]
        : ['driver' => 'local', 'root' => storage_path('app/public'), 'url' => env('APP_URL') . '/storage', 'visibility' => 'public', 'throw' => true],
],
```
- S3 driver: `composer require league/flysystem-aws-s3-v3 "^3.0"` (শুধু `FILES_DRIVER=s3` হলে)। **দুটি আলাদা bucket**: `private` bucket-এ কোনো public-read নেই (bucket policy-তে নিষিদ্ধ); `public` bucket CDN-এর পিছনে।
- **এক সার্ভার → অনেক সার্ভার = শুধু `FILES_DRIVER=s3`**; কোড বা ডেটাবেস বদলায় না, কারণ ডেটাবেসে সংরক্ষিত পাথ ডিস্ক-সাপেক্ষ (relative)।
- **লোকাল ডিস্কে কোনো স্থায়ী অবস্থা নয়:** `storage_path()` শুধু একটি request/job-এর ভিতরে ক্ষণস্থায়ী ফাইলের জন্য (`sys_get_temp_dir()`-এ), `finally`-তে মুছে; ফল সবসময় `private` ডিস্কে গিয়ে `temporaryUrl()`। নইলে সার্ভার A-র queue-worker যা বানাল তা সার্ভার B-র ডাউনলোডে নেই।

## ২. পাথ-নিয়ম (একটিই)
`institutions/{inst}/<এলাকা>/…/<uuid>.<ext>` — প্ল্যাটফর্মের নিজস্ব ফাইল `platform/…` (এখন ব্যবহার নেই, সংরক্ষিত)।
- **ফাইলের নাম সবসময় সার্ভারের UUID**; ক্লায়েন্টের নাম বা ক্লায়েন্টের এক্সটেনশন কখনো নয় — এক্সটেনশন `$file->extension()` (MIME-sniffed) থেকে।
- **ছাত্রের সাথে বাঁধা সব ফাইল `institutions/{inst}/students/{sid}/…`-এর নিচে** — তাহলে "মুছে ফেলার অধিকার" একটি `deleteDirectory` দিয়ে সব মোছে, ভুলে যাওয়ার সুযোগ নেই।
- প্রতিষ্ঠান মুছলে (`tenant:purge`) `institutions/{inst}/` পুরোটা দুই ডিস্ক থেকেই।
- অস্থায়ী আউটপুট (বাল্ক PDF, QR): `institutions/{inst}/tmp/{uuid}.{ext}`, `temporaryUrl()` ১ ঘণ্টা, `files:prune-tmp` দৈনিক (২৪ ঘণ্টার পুরনো মোছে)।

| কলাম | মালিক | ডিস্ক | পাথ |
|---|---|---|---|
| `institutions.logo_path` | institution | public | `institutions/{inst}/branding/logo-{uuid}.{ext}` |
| `institutions.favicon_path` | institution | public | `institutions/{inst}/branding/favicon-{uuid}.{ext}` |
| `users.avatar` | user | private | `institutions/{inst}/users/{uid}/avatar-{uuid}.{ext}` |
| `students.photo` | student | private | `institutions/{inst}/students/{sid}/photo-{uuid}.{ext}` |
| `student_documents.file_path` | student | private | `institutions/{inst}/students/{sid}/documents/{uuid}.{ext}` |
| `student_leave_requests.attachment` | student | private | `institutions/{inst}/students/{sid}/leave/{uuid}.{ext}` |
| `homework_submissions.file_path` | student | private | `institutions/{inst}/students/{sid}/homework/{uuid}.{ext}` |
| `certificates.pdf_path` | student | private | `institutions/{inst}/students/{sid}/certificates/{certificate_no}.pdf` |
| `homeworks.file_path` | institution | private | `institutions/{inst}/learning/homework/{uuid}.{ext}` |
| `class_materials.file_path` | institution | private | `institutions/{inst}/learning/materials/{uuid}.{ext}` |
| `notices.attachment` | institution | private | `institutions/{inst}/notices/{uuid}.{ext}` |
| `expenses.receipt_path` | institution | private | `institutions/{inst}/finance/expenses/{uuid}.{ext}` |
| `visitor_logs.photo` | visitor | private | `institutions/{inst}/visitors/{uuid}.{ext}` (ব্যক্তিগত তথ্য; `visitor_logs`-এর retention-এর সাথে মোছা) |
| `staff_members.photo` | staff | private | `institutions/{inst}/staff/{id}/photo-{uuid}.{ext}` |
| `teacher_trainings.certificate_path` | institution | private | `institutions/{inst}/hr/training/{uuid}.{ext}` |
| `salary_revisions.acknowledged_path` | institution | private | `institutions/{inst}/hr/payroll/{uuid}.{ext}` (D33: বেতন-ডেটা, প্ল্যাটফর্ম-অগম্য) |
| `salary_adjustments.attachment` | institution | private | `institutions/{inst}/hr/payroll/{uuid}.{ext}` (D33) |
| `tenant_exports.file_path` | institution | private | `institutions/{inst}/exports/{export_id}.enc` |
| `import_jobs.file_path` | institution | private | `institutions/{inst}/imports/{job_id}.{ext}` |
| `gallery_items.file_path` | institution | public | `institutions/{inst}/gallery/{album}/{uuid}.{ext}` |
| `site_posts.cover` | institution | public | `institutions/{inst}/site/{uuid}.{ext}` |
| (কলাম নেই) স্বাক্ষর/সিল | institution | private | `institutions/{inst}/branding/signatures/{uuid}.png` |
| (কলাম নেই) অস্থায়ী PDF/QR | institution | private | `institutions/{inst}/tmp/{uuid}.{ext}` |

## ৩. সরবরাহ
- `private`: কখনো `url()` নয় (S3-তে বন্ধ), শুধু `temporaryUrl($path, now()->addMinutes(5..10))` অথবা অনুমোদিত controller থেকে stream (`Gate` পরে)। ছাত্রের ছবি ও নথি = ৫–১০ মিনিট; অস্থায়ী PDF = ১ ঘণ্টা।
- `public`: `Storage::disk('public')->url()`, CDN-এর পিছনে (`PUBLIC_FILES_URL`)। **শুধু** লোগো, ফেভিকন, গ্যালারি, সাইটের ছবি — যেখানে ছাত্রের চেহারা থাকতে পারে (গ্যালারি) সেখানে সম্মতির নিয়ম `public-website-plus.md`।
- আপলোডের সীমা ও MIME `docs/SECURITY.md`; ছবির EXIF/GPS মুছে ফেলা (`public-website-plus.md`)।

## ৪. ডিস্ক বদল
`php artisan files:migrate-disk --from=local --to=s3 [--dry-run]` (স্পেক): প্রতিটি `private`/`public` ফাইল কপি, **checksum মিলিয়ে**, তারপর (আলাদা `--delete-source` পতাকায়) মোছা; ডেটাবেসের পাথ বদলায় না। চলার সময় পড়া কোন ডিস্ক থেকে — `FILES_FALLBACK_DRIVER` (পুরনো ডিস্কে ফেরা পড়া)।

## ৫. পরীক্ষা
| Test | Asserts |
|---|---|
| `FileDiskNamesTest` | কোডে `Storage::disk()`/`store()`-এর ডিস্ক শুধু `private`/`public`; `storage_path`/`public_path` ব্যবহারকারী-ফাইলে নয় (static scan) |
| `FilePathPrefixTest` | প্রতিটি আপলোড-সহায়ক পাথ `institutions/{id}/`-এ শুরু; ছাত্র-বাঁধা ফাইল `students/{sid}/`-এর নিচে |
| `FileCollisionTest` | দুই প্রতিষ্ঠান একই সেকেন্ডে বাল্ক ID-কার্ড বানালে পাথ আলাদা, একটি অন্যটির উপর পড়ে না |
| `ErasureRemovesAllStudentFilesTest` | ছাত্রের প্রতিটি ধরনের ফাইল (ছবি, নথি, ছুটির সংযুক্তি, জমা, সনদ) আপলোড → erase → `students/{sid}/` খালি |
| `TenantPurgeFilesTest` | `tenant:purge` দুই ডিস্কেই `institutions/{id}/` খালি করে; অন্য প্রতিষ্ঠান অক্ষত |
| `PrivateNeverPublicUrlTest` | `private`-এ `url()` ব্যর্থ/নিষিদ্ধ; `temporaryUrl` মেয়াদ-শেষে 403 |
| `NoClientFilenameTest` | `../../x.php`, `evil.php.jpg` নামে আপলোডে সংরক্ষিত নাম UUID, এক্সটেনশন MIME থেকে |
| `FilesDriverSwitchTest` | `FILES_DRIVER=local` ও `s3`-fake উভয়ে একই পরীক্ষা-সেট সবুজ (পাথ একই) |
| `PruneTmpTest` | ২৪ ঘণ্টার পুরনো `tmp/` মোছে, নতুন থাকে |
**Done When:** একই পরীক্ষা-সেট `FILES_DRIVER=local` এবং MinIO-তে (S3-সামঞ্জস্য) সবুজ; erasure-পরীক্ষায় `students/{sid}/` সত্যিই খালি।
