# Public Website & Online Admission Form (Revision 6.2)

## Decision (OD-3)
প্রতিটি প্রতিষ্ঠানের নিজের ঠিকানায় (subdomain বা custom domain) একটি ছোট, দ্রুত, Google-এ খুঁজে পাওয়া যায় এমন পাবলিক সাইট থাকবে, যার প্রধান কাজ **ভর্তি-আবেদন সংগ্রহ**। আবেদন সরাসরি `admission_leads`-এ যায় (source = `website`), তাই কোচিংয়ের lead-pipeline ও স্কুল-কলেজের ভর্তি-অনুসন্ধান একই জায়গায় আসে।

এটি ইচ্ছাকৃতভাবে ছোট রাখা হয়েছে: পূর্ণ CMS নয়, কারণ তাতে প্রতিটি প্রতিষ্ঠান আলাদা "ওয়েবসাইট বিল্ডার" চাইবে এবং মূল পণ্যের কাজ (ব্যবস্থাপনা) চাপা পড়বে।

| Included (release 1) | Excluded (জেনেশুনে বাদ) |
|---|---|
| Home (hero, পরিচিতি, Course/Class তালিকা, সাম্প্রতিক নোটিশ, যোগাযোগ) | ছবির গ্যালারি, ব্লগ/সংবাদ, শিক্ষক-প্রোফাইল পাতা, ইভেন্ট ক্যালেন্ডার |
| `/notices` — শুধু "public" চিহ্নিত নোটিশ | কাস্টম পেজ বানানো (drag-drop builder) |
| `/admission` — আবেদন ফর্ম | আবেদনের সাথে ভর্তি ফি অনলাইনে নেওয়া |
| Login বাটন (Student/Parent/Teacher/Admin) | Student/শিক্ষকের ফলাফল বা কোনো ব্যক্তিগত ডেটা পাবলিক করা |
| SEO: title/description/Open Graph/canonical, `robots.txt`, `sitemap.xml` | প্রতিষ্ঠানের নিজস্ব ডিজাইন-লেআউট (theme-এর রঙ/ফন্ট/গোলাকৃতি প্রযোজ্য; ৪টি app layout নয়) |

এগুলোর কোনোটি পরে চাইলে Phase 10-এ আলাদা spec হবে; এখন বানাবেন না।

## Module & Gating
- Module key `public_site` — চার type-এই (`docs/modules/institution-types.md`)। Plan gating নেই (সব plan)।
- Default: school, college, coaching → `settings.public_site.enabled = true` (onboarding-এ তৈরি হয়); private_batch → `false` (মালিক চাইলে চালু করেন)।
- Module বন্ধ থাকলে `public/*` API `403 module_disabled`; module চালু কিন্তু `enabled = false` হলে `404`। দুই ক্ষেত্রেই tenant host-এর root (`/`) সরাসরি `/login`-এ যায়।
- "Powered by" footer: `theme.white_label === false` হলে দেখায়।

## Data
| Where | What |
|---|---|
| `institutions.settings.public_site` (JSON) | নিচের schema |
| `programs.is_public`, `programs.public_description` | কোন Course/Class পাবলিক তালিকায় যাবে ও এক-দুই লাইনের বর্ণনা |
| `notices.is_public` | নোটিশ পাবলিক কি না (default `0`) |
| `admission_leads` | আবেদন; নতুন কলাম: `guardian_name, email, current_class, message, interested_batch_id, ip_hash` |
| `institutions.logo_path`, theme | লোগো ও রঙ — theme system থেকে (`docs/THEMING.md`) |

### `settings.public_site` Schema (সব key ঐচ্ছিক; অনুপস্থিত হলে default)
```json
{
  "enabled": true,
  "headline": "ভর্তি চলছে — সেশন ২০২৬-২৭",
  "tagline": "আপনার সন্তানের সফল ভবিষ্যতের পথে",
  "about": "২০০ অক্ষরের মধ্যে সংক্ষিপ্ত পরিচিতি… (সর্বোচ্চ ১৫০০ অক্ষর, plain text, ফাঁকা লাইনে অনুচ্ছেদ)",
  "hero_image_path": null,
  "show_programs": true,
  "show_notices": true,
  "admission_open": true,
  "admission_message": "আবেদন জমা দিলে আমরা ২ কর্মদিবসের মধ্যে যোগাযোগ করব।",
  "contact": { "phone": "01XXXXXXXXX", "email": "", "address": "", "map_url": "", "facebook_url": "", "whatsapp": "" },
  "seo": { "title": "", "description": "" },
  "alert_sms": false
}
```
- সব text plain text — HTML/Markdown গ্রহণ ও render করা হয় না (XSS এড়াতে frontend `{text}` হিসেবেই দেখায়, `dangerouslySetInnerHTML` কখনো নয়)।
- URL field (`map_url`, `facebook_url`): `https://` দিয়ে শুরু হতে হবে; অন্যথায় বাতিল।
- `hero_image_path`: JPG/PNG/WebP, ≤ ২ MB; theme logo upload-এর মতোই (`POST /admin/settings/website/hero`)।
- `seo.title/description` ফাঁকা হলে `headline`/`about`-এর শুরু থেকে স্বয়ংক্রিয়।
- `alert_sms = true` হলে নতুন আবেদনে প্রতিষ্ঠানের `phone`-এ একটি SMS (১ credit)। Default বন্ধ; in-app notification সবসময়।
- Bootstrap-এ শুধু `public_site.enabled` যায়, বাকি নয় (নিচে "Bootstrap Whitelist")।

---

## Routes (SPA) & Pages
| Path | Page | Notes |
|---|---|---|
| `/` | `PublicHome` | `public_site.enabled` হলে; নইলে `<Navigate to="/login"/>` |
| `/notices` | `PublicNotices` | পাতা-ভাগ (১০টি); `is_public = 1` |
| `/admission` | `PublicAdmission` | `admission_open = false` হলে ফর্মের জায়গায় "বর্তমানে ভর্তি বন্ধ" বার্তা |
| `/login` | আগের মতো | Home-এর "লগইন" বাটন এখানে নেয় |

`PublicLayout` — একটি সরল layout (উপরে লোগো+নাম+মেনু: Home, Notices, ভর্তি, লগইন; নিচে footer)। এটি `AppShell` ও `layout_key` ব্যবহার করে না, কিন্তু `ThemeProvider` ব্যবহার করে — তাই রঙ, ফন্ট, radius, card style প্রতিষ্ঠানের থিম অনুযায়ী। মোবাইল-প্রথম (বেশিরভাগ অভিভাবক ফোনে দেখবেন)।

**Home-এর অংশ (ক্রম):** Hero (লোগো, headline, tagline, "ভর্তির আবেদন" বাটন, "লগইন" বাটন) → পরিচিতি (`about`) → Course/Class তালিকা (`show_programs`; কার্ডে নাম, `public_description`; coaching-এ `duration_months` ও `course_fee` থাকলে) → সাম্প্রতিক ৫টি public নোটিশ (`show_notices`) → যোগাযোগ (ফোন — `tel:` লিংক, WhatsApp, ঠিকানা, ম্যাপ লিংক) → footer।
Label-এ "Course/Class/ব্যাচ" শব্দ `useTerms()` থেকে।

**Admission ফর্ম fields:**
| Field | Required | Note |
|---|---|---|
| আবেদনকারীর নাম (`name`) | ✅ | ≤ ১০০ |
| অভিভাবকের নাম (`guardian_name`) | — | |
| মোবাইল (`phone`) | ✅ | `^01[3-9]\d{8}$` (বাংলাদেশি নম্বর; `+880`/`880` সরিয়ে স্বাভাবিক করা হয়) |
| ইমেইল (`email`) | — | |
| বর্তমান ক্লাস/প্রতিষ্ঠান (`current_class`) | — | |
| আগ্রহী Course/Class (`interested_program_id`) | — | public programs থেকে dropdown; পরিবেশ ভেদে Batch-ও (`interested_batch_id`), শুধু coaching/private_batch-এ এবং শুধু `upcoming`/`running` |
| বার্তা (`message`) | — | ≤ ৫০০ |
| গোপনীয়তা সম্মতি (`consent`) | ✅ | চেকবক্স "আমি [গোপনীয়তা নীতি](/privacy) পড়েছি এবং যোগাযোগের জন্য আমার ফোন ব্যবহারে সম্মত" — `accepted` না হলে 422; `admission_leads.consented_at` (`docs/legal/privacy-and-consent.md` §3) |
| লুকানো `website` field | — | **honeypot** — ভরা থাকলে নীরবে সফল দেখিয়ে কিছু সংরক্ষণ করে না |

---

## API (Tenant Host, Public — No Auth)
```
GET  /api/v1/public/site         → { name, logo_url, theme?, settings:{headline,tagline,about,hero_url,admission_open,contact,show_*},
                                     programs:[{id,name,public_description,duration_months,course_fee,batches?}], notices:[{id,title,excerpt,published_at}] }
GET  /api/v1/public/notices?page=
POST /api/v1/public/admission    → 201 { ok: true, message }          (throttle: PUBLIC_ADMISSION_RATE_PER_HOUR per IP+institution)
```
SEO shell, `robots.txt` ও `sitemap.xml` JSON API নয় — ব্রাউজার ও crawler সরাসরি যে পথ খোলে সেই পথেই Laravel উত্তর দেয় (`routes/public.php`, নিচে "SEO Shell")।
Middleware: `tenant` + `module:public_site`। (shell/robots/sitemap আলাদা, `tenant:optional` — central host-এ সাধারণ SPA/robots ফেরত।) কোনো endpoint কোনো Student/User/ফি/ফলাফলের ডেটা ফেরত দেয় না। `programs` শুধু `is_public = 1 AND is_active = 1`; `batches` শুধু coaching/private_batch-এ এবং শুধু নাম ও সময়সূচি — ফি বা আসন সংখ্যা নয় (সংখ্যা প্রতিযোগীকে তথ্য দেয়)।

### `PublicAdmissionController::store` — Full Code
```php
public function store(PublicAdmissionRequest $r)
{
    $i = app('currentInstitution');
    abort_unless(($i->settings['public_site']['enabled'] ?? false) && ($i->settings['public_site']['admission_open'] ?? true), 404);

    if ($r->filled('website')) return response()->json(['ok' => true]);               // honeypot: pretend success, store nothing

    $phone  = normalize_bd_phone($r->input('phone'));                                  // 01XXXXXXXXX
    $ipHash = hash('sha256', $r->ip() . config('app.key'));                            // the raw IP is never stored

    // Same phone applying again within 24h: update the existing lead's note instead of creating a duplicate
    $lead = AdmissionLead::where('phone', $phone)->where('created_at', '>=', now()->subDay())->first();
    if ($lead) {
        $lead->update(['note' => trim(($lead->note ?? '') . "\n[" . now()->format('d/m H:i') . "] আবার আবেদন: " . $r->input('message'))]);
        return response()->json(['ok' => true, 'message' => $i->settings['public_site']['admission_message'] ?? 'ধন্যবাদ']);
    }

    // Foreign keys must belong to THIS institution (global scope on Program/Batch enforces it) and be public/open
    $program = $r->integer('interested_program_id') ? Program::where('is_public', 1)->where('is_active', 1)->find($r->integer('interested_program_id')) : null;
    $batch   = ($program && $r->integer('interested_batch_id'))
             ? Batch::where('program_id', $program->id)->whereIn('status', ['upcoming', 'running'])->find($r->integer('interested_batch_id')) : null;

    $lead = AdmissionLead::create([
        'name' => $r->input('name'), 'guardian_name' => $r->input('guardian_name'), 'phone' => $phone,
        'email' => $r->input('email'), 'current_class' => $r->input('current_class'), 'message' => $r->input('message'),
        'interested_program_id' => $program?->id, 'interested_batch_id' => $batch?->id,
        'source' => 'website', 'status' => 'new', 'ip_hash' => $ipHash, 'consented_at' => now(),
    ]);

    $i->admins->each->notify(new NewAdmissionLead($lead));                              // in-app
    if ($i->settings['public_site']['alert_sms'] ?? false) {
        SendSmsJob::dispatch($i->phone, "নতুন ভর্তি-আবেদন: {$lead->name}, {$lead->phone}", $i->id);
    }
    return response()->json(['ok' => true, 'message' => $i->settings['public_site']['admission_message'] ?? 'ধন্যবাদ'], 201);
}
```
`PublicAdmissionRequest` validation: নিয়ম উপরের ফর্ম টেবিল অনুযায়ী; `message`/`name` থেকে `strip_tags`; অতিরিক্ত field উপেক্ষা (`$r->only(...)`)। Rate limiter `admission` `AppServiceProvider`-এ: `Limit::perHour(config('app.public_admission_rate'))->by(institution_id . ip)`। অতিরিক্ত অনুরোধে `429` ও বাংলা বার্তা।

**Duplicate কেন ২৪ ঘণ্টা:** একই ফোন থেকে বারবার ক্লিক/ফর্ম পাঠানো সাধারণ; আলাদা lead-এ Admin-এর তালিকা ভরে যায়।
**Spam:** honeypot + rate limit + ফোন regex যথেষ্ট ধরা হয়েছে; এতে সমস্যা হলে পরে CAPTCHA যোগ হবে (কোনো তৃতীয়-পক্ষ script এখন নয়)।

### Convert to Student
আবেদন বিদ্যমান `POST /leads/{id}/convert` দিয়ে Student হয় (`docs/modules/coaching-private-batch.md`)। এজন্য `leads` module লাগে, তাই:
- `school` ও `college`-এর `modules` তালিকায় `leads` যোগ হয়েছে (`docs/modules/institution-types.md`) — আগে শুধু coaching-এ ছিল।
- `private_batch`-এ `leads` নেই। Admin যখন সেখানে ওয়েবসাইট চালু করে (`public_site.enabled` false → true), সিস্টেম স্বয়ংক্রিয়ভাবে `enabled_modules.leads = true` বসায়; বন্ধ করলে সরায় না (আবেদনগুলো দেখতে থাকবে)। `leads` plan-gated নয়, তাই কোনো upgrade লাগে না।

---

## SEO Shell (Why and How)
React SPA-র HTML-এ প্রতিষ্ঠান-নির্দিষ্ট title/description থাকে না, ফলে Google/Facebook preview-তে সবার একই নাম আসত। সমাধান: Home, Notices ও Admission পাতার প্রথম লোড Laravel একটি "shell" দিয়ে সাজায় — build করা `index.html` পড়ে `<title>` বদলায় ও `<head>`-এ meta বসায়; তারপর SPA যথারীতি চলে। কোনো SSR framework লাগে না।

**Nginx** (`infra/nginx.conf`): exact-match `location = /`, `= /notices`, `= /admission`, `= /robots.txt`, `= /sitemap.xml` সরাসরি Laravel-এ (FastCGI) যায় — **`rewrite` নয়**, কারণ rewrite করলে `REQUEST_URI` মূল পথই থাকে এবং Laravel ভুল path route করে। বাকি সব path (`/login`, `/admin/...`, asset) আগের মতো `try_files … /index.html`।

**Laravel:** `bootstrap/app.php`-এ `->withRouting(api: __DIR__.'/../routes/api.php', then: fn () => Route::middleware('tenant:optional')->group(base_path('routes/public.php')))` — session/CSRF ছাড়া, তাই কোনো cookie সেট হয় না।
```php
// routes/public.php
Route::get('/',          [PublicShellController::class, 'home']);
Route::get('/notices',   [PublicShellController::class, 'notices']);
Route::get('/admission', [PublicShellController::class, 'admission']);
Route::get('/privacy',     [PublicShellController::class, 'privacy']);     // `docs/legal/privacy-and-consent.md`: same SEO-shell mechanism, text from config + institution extra
Route::get('/terms',       [PublicShellController::class, 'terms']);
Route::get('/robots.txt',  [PublicShellController::class, 'robots']);
Route::get('/sitemap.xml', [PublicShellController::class, 'sitemap']);
```

```php
// app/Http/Controllers/Public/PublicShellController.php
public function home(Request $r, TenantResolver $tenants, DomainService $domains)     { return $this->render($r, 'home', $tenants, $domains); }
public function notices(Request $r, TenantResolver $t, DomainService $d)             { return $this->render($r, 'notices', $t, $d); }
public function admission(Request $r, TenantResolver $t, DomainService $d)           { return $this->render($r, 'admission', $t, $d); }
// robots() and sitemap(): see the rules below

private function render(Request $r, string $page, TenantResolver $tenants, DomainService $domains)
{
    $html = file_get_contents(config('app.public_shell_path'));            // PUBLIC_SHELL_PATH; cache in memory per worker, filemtime-checked
    $host = strtolower($r->getHost());

    if ($tenants->isCentralHost($host) || !app()->bound('currentInstitution')) {
        return response($html)->header('Content-Type', 'text/html; charset=utf-8')->header('Cache-Control', 'no-cache');
    }
    $i  = app('currentInstitution');
    $ps = $i->settings['public_site'] ?? [];
    $on = ($ps['enabled'] ?? false) && app(ModuleGate::class)->allows($i, 'public_site');

    $labels = ['home' => '', 'notices' => ' — নোটিশ', 'admission' => ' — ভর্তি'];
    $title = e(($ps['seo']['title'] ?? '') ?: ($i->name . $labels[$page]));
    $desc  = e(\Str::limit(($ps['seo']['description'] ?? '') ?: ($ps['about'] ?? $ps['headline'] ?? $i->name), 160, ''));
    $canon = e($domains->primaryUrl($i) . ($page === 'home' ? '/' : '/' . $page));
    $img   = $i->logo_path ? e(Storage::disk('public')->url($i->logo_path)) : '';

    $head  = "<meta name=\"description\" content=\"{$desc}\">"
           . "<link rel=\"canonical\" href=\"{$canon}\">"
           . "<meta property=\"og:type\" content=\"website\"><meta property=\"og:title\" content=\"{$title}\">"
           . "<meta property=\"og:description\" content=\"{$desc}\"><meta property=\"og:url\" content=\"{$canon}\">"
           . ($img ? "<meta property=\"og:image\" content=\"{$img}\">" : '')
           . ($on ? '' : '<meta name="robots" content="noindex">');
    $html = preg_replace('#<title>.*?</title>#s', "<title>{$title}</title>", $html, 1);
    $html = str_replace('</head>', $head . '</head>', $html);                 // first occurrence only is fine: one </head>

    return response($html)->header('Content-Type', 'text/html; charset=utf-8')->header('Cache-Control', 'no-cache');
}
```
- **Canonical সবসময় `primaryUrl()`** (custom domain active থাকলে সেটি, নইলে subdomain) — একই সাইট দুই ঠিকানায় থাকলে Google-এ duplicate না হয়।
- `e()` দিয়ে সব মান escape — প্রতিষ্ঠানের লেখা text থেকে HTML injection নয়।
- `robots`: `Allow: /`, `/notices`, `/admission`; `Disallow: /admin /teacher /student /parent /accountant /api /login /onboarding`; শেষে `Sitemap: {primaryUrl}/sitemap.xml`। Public site বন্ধ থাকলে `Disallow: /`।
- `sitemap`: তিনটি URL (`/`, `/notices`, `/admission` — admission বন্ধ হলে বাদ), `lastmod` = সর্বশেষ public notice/settings পরিবর্তন।
- Cache: shell `no-cache` (ছোট, Laravel hit সস্তা); `/api/v1/public/site` `Cache::remember("public_site:{institution_id}", 300)` — settings, public program/notice বদলালে `forget`।
- **Search-এ আসতে সময় লাগে** — Google index করতে দিন-সপ্তাহ লাগে; Done When-এ এটি পরীক্ষা করা হয় না, শুধু meta ও sitemap সঠিক কি না।

## Bootstrap Whitelist
`/bootstrap` পাবলিক, তাই `institutions.settings` পুরোটা পাঠানো **নিষেধ**। শুধু এই key গুলো: `use_programs, student_portal, use_gpa, fee_proration`, এবং `public_site.enabled` (`public_site: { enabled }` আকারে)। কোনো payment, SMS, `platform_collect`, `platform_fee_percent` ইত্যাদি নয়। Code: `BootstrapController::publicSettings(Institution): array` — একটি allow-list array, deny-list নয়।

## Admin UI — `/admin/settings/website`
চালু/বন্ধ টগল; headline, tagline, about (অক্ষর গণনা সহ), hero ছবি, যোগাযোগ, ভর্তি খোলা/বন্ধ ও বার্তা, SEO title/description (গুগলে কেমন দেখাবে তার preview), `alert_sms`; "সাইট দেখুন" লিংক (`primaryUrl()`)। আলাদা জায়গায়: Program form-এ "ওয়েবসাইটে দেখাও" + বর্ণনা; Notice form-এ "পাবলিক" চেকবক্স (সতর্কবার্তা: "যে কেউ দেখতে পাবে")। `/admin/leads`-এ source ফিল্টার; "website" ট্যাগ।

## Tests (`tests/Feature/PublicSite/`)
| Test | Asserts |
|---|---|
| `PublicAdmissionTest` | সঠিক ফর্ম → 201 ও `admission_leads` row (`source=website`), Admin-এর in-app notification; অবৈধ ফোন → 422; honeypot ভরা → 201 কিন্তু row নেই; একই ফোন ২৪ ঘণ্টায় দুবার → একটিই row, note যুক্ত; ৬ষ্ঠ অনুরোধ/ঘণ্টা → 429; `admission_open=false` → 404; অন্য প্রতিষ্ঠানের `program_id` → উপেক্ষিত (null); raw IP কোথাও সংরক্ষিত নয় |
| `PublicSiteDataTest` | `/public/site` শুধু public+active program, public notice; কোনো student/ফি/ফোন (প্রতিষ্ঠানের contact বাদে) নেই; module বন্ধ → 403, `enabled=false` → 404; অন্য tenant-এর ডেটা আসে না |
| `PublicShellTest` | `GET /`, `/notices`, `/admission`, `/robots.txt`, `/sitemap.xml` (Host header সহ) 200; title ও canonical প্রতিষ্ঠানের নামে; custom domain active হলে canonical সেটি; অবৈধ HTML (`<script>` নামে) escape হয়; public site বন্ধ হলে `noindex`; central host-এ অপরিবর্তিত `index.html`; `robots`/`sitemap` সঠিক |
| `BootstrapWhitelistTest` | `/bootstrap` response-এ allow-list ছাড়া কোনো `settings` key নেই (payment/SMS key সহ) |
| `PublicSiteFrontendTest` (Vitest) | `PublicHome` প্রোগ্রাম তালিকা দেখায়, `dangerouslySetInnerHTML` ব্যবহার করে না (grep CI); admission ফর্ম অবৈধ ফোনে সাবমিট আটকায়; `enabled=false` হলে `/` → `/login` |

## Done When
- [ ] তিনটি demo tenant-এর (school, coaching, private_batch) মধ্যে school ও coaching-এর `/` পাবলিক সাইট দেখায়; private_batch-এর `/` সরাসরি login।
- [ ] ফোন ব্রাউজারে (360px) ফর্ম পূরণ → Admin panel-এ lead দেখা যায় → Student-এ convert।
- [ ] `curl -s https://<host>/ | grep -o '<title>[^<]*'` প্রতিষ্ঠানের নাম দেখায়; `og:` ট্যাগ ও canonical আছে; `/robots.txt` ও `/sitemap.xml` সঠিক।
- [ ] উপরের test class গুলো পাস; CI-র `npm run lint:theme` পাবলিক পাতাতেও খালি।
