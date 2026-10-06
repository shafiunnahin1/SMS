# Custom Domain — Complete Guide (Revision 6)

## Overview
প্রতিটি প্রতিষ্ঠান তিনভাবে প্ল্যাটফর্মে ঢুকতে পারে:

| # | Type | Example | Plan | How It Resolves |
|---|---|---|---|---|
| 1 | Default subdomain | `dhanmondi-school.schoolapp.com` | সব plan | `institutions.slug` |
| 2 | Chosen subdomain (slug বদল) | `dhanmondi.schoolapp.com` | `custom_subdomain` (Pro+) | `institutions.slug` |
| 3 | Custom domain | `portal.dhanmondischool.edu.bd` বা `dhanmondischool.edu.bd` | `custom_domain` (Enterprise) | `institution_domains` (status `active`) |

Custom domain চালু হলেও ১ ও ২ নম্বর ঠিকানা সবসময় কাজ করে — DNS-এ সমস্যা হলে প্রতিষ্ঠান কখনো বাইরে আটকে পড়ে না।

এই ফাইলে আছে: (A) architecture ও locked decision, (B) agent-এর জন্য backend/frontend বাস্তবায়ন, (C) একবারের server ও DNS setup, (D) ক্লায়েন্টকে দেওয়ার মতো ধাপে-ধাপে নির্দেশিকা, (E) Super Admin-এর কাজ, (F) troubleshooting, (G) test ও Done-When।

---

# Part A — Architecture

```
Browser ──HTTPS──▶ Caddy :443  (TLS for every host)
                     │   ├─ *.schoolapp.com, schoolapp.com → ONE wildcard cert (DNS-01 via Cloudflare)
                     │   └─ any other host → on-demand cert (HTTP-01), only if Laravel "ask" says 200
                     ▼
                  Nginx 127.0.0.1:8080  (plain HTTP, same config for every host)
                     ├─ /            → React SPA build (one build for all tenants)
                     └─ /api         → Laravel
                                          └─ TenantMiddleware → TenantResolver(Host)
                                                ├─ central host?            → no tenant (landing / signup / Super Admin)
                                                ├─ {slug}.schoolapp.com     → institutions.slug
                                                └─ anything else            → institution_domains.domain (active)
```

## Locked Decisions
1. **Edge = Caddy, internal = Nginx.** Nginx-এ কোনো certificate নেই। Config: `infra/Caddyfile`, `infra/nginx.conf`।
2. **SPA ও API একই origin।** `VITE_API_URL=/api/v1` (relative)। তাই custom domain-এ CORS, cookie domain বা আলাদা build — কিছুই লাগে না।
3. **Tenant শুধু `Host` থেকে।** কোনো header/query parameter দিয়ে tenant বদলানো যায় না। Code: `docs/templates/laravel-core-files.md` (`TenantMiddleware`, `TenantResolver`, `config/tenancy.php`)।
4. **Custom domain আলাদা table-এ** (`institution_domains`) — `institutions` টেবিলে কোনো `custom_domain` কলাম নেই।
5. **Ownership প্রমাণ = DNS আমাদের দিকে point করা** (CNAME বা A) + ঐচ্ছিক Super Admin approval (`DOMAIN_REQUIRE_APPROVAL`, default `true`)। আলাদা TXT record লাগে না।
6. **Certificate শুধু `active` domain-এর জন্য ইস্যু হয়** — Caddy-র `ask` endpoint এটি নিশ্চিত করে। এটি বাদ দিলে যে কেউ সার্ভারকে দিয়ে অসংখ্য certificate request করাতে পারে।
7. **Payment gateway callback সবসময় central domain-এ** (`https://schoolapp.com/api/v1/payments/...`) — bKash/Nagad/SSLCommerz-এ একটিই callback domain whitelist থাকে। Callback শেষে user-কে প্রতিষ্ঠানের primary URL-এ redirect।
8. **Token per origin।** Sanctum bearer token `localStorage`-এ থাকে, যা origin-ভিত্তিক — subdomain থেকে custom domain-এ গেলে আবার login লাগে। এটি প্রত্যাশিত; cross-domain session ভাগাভাগির চেষ্টা করবেন না।

## Central Hosts & Reserved Slugs
- `CENTRAL_DOMAINS` (`schoolapp.com`, `www.schoolapp.com`, `admin.schoolapp.com`): কোনো tenant bind হয় না। `schoolapp.com` = landing + signup; `admin.schoolapp.com` = Super Admin panel।
- Super Admin login শুধু `SUPER_ADMIN_DOMAIN`-এ সম্ভব; tenant host-এ `super_admin` role-এর login `403`। Tenant user central host-এ login করতে পারে না।
- `config('tenancy.reserved_slugs')`-এর কোনো slug প্রতিষ্ঠান নিতে পারে না (signup ও slug পরিবর্তন — দুই জায়গায় validation)।
- Slug নিয়ম: `^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$`, unique।

---

# Part B — Implementation (Agent)

## Database
`institution_domains` — `docs/database/schema.sql` (Revision 6 section)। Model `InstitutionDomain` `BelongsToInstitution` ব্যবহার করে; `TenantResolver` ও `tls-check` `withoutGlobalScopes()` দিয়ে পড়ে।

## State Machine
```
            add                    DNS check OK                approve (or auto)
 (none) ─────────▶ pending_dns ──────────────────▶ dns_verified ────────────────▶ active
                       │  ▲                                                        │
        24h / 30 tries │  │ "Verify again"                    DNS stops pointing   │ plan lost / Super Admin
                       ▼  │                                   (3 daily failures)   ▼
                     failed ◀──────────────────────────────────────────────────  disabled
```
| Status | Meaning | Resolves tenant? | Certificate issued? |
|---|---|---|---|
| `pending_dns` | যোগ হয়েছে, DNS এখনো আমাদের দিকে নয় | ❌ | ❌ |
| `dns_verified` | DNS ঠিক, approval-এর অপেক্ষায় | ❌ | ❌ |
| `active` | চালু | ✅ | ✅ |
| `failed` | সময়সীমার মধ্যে DNS মেলেনি, অথবা active অবস্থায় DNS সরে গেছে | ❌ | ❌ |
| `disabled` | Plan-এ আর `custom_domain` নেই, বা Super Admin বন্ধ করেছে | ❌ | ❌ |

`DOMAIN_REQUIRE_APPROVAL=false` হলে `dns_verified` হওয়ামাত্র `active`।

## API Endpoints
```
# Institution Admin (module flag: custom_domain; otherwise 403 feature_not_available)
GET    /admin/domains                    → list + DNS instructions (cname_target, a_target) + default subdomain URL
POST   /admin/domains                    → { domain }            → 201, status pending_dns
POST   /admin/domains/{id}/verify        → run the DNS check now (throttle: 6/min)
POST   /admin/domains/{id}/primary       → make primary (must be active)
DELETE /admin/domains/{id}
PUT    /admin/slug                       → { slug }  (flag: custom_subdomain)

# Super Admin
GET    /super/domains?status=dns_verified          → approval queue (all institutions)
POST   /super/domains/{id}/approve | /reject       → reject: { reason } → failed
POST   /super/domains/{id}/disable | /recheck
POST   /super/institutions/{id}/domains            → add on behalf of an institution (skips plan check)

# Internal (loopback only — Nginx allows 127.0.0.1 only; route has NO tenant/auth middleware)
GET    /api/internal/tls-check?domain={host}       → 200 if certificate may be issued, else 404
```

## DomainService.php — Full Code
```php
<?php
namespace App\Services\Tenancy;

use App\Models\{Institution, InstitutionDomain};
use Illuminate\Validation\ValidationException;

class DomainService
{
    public function __construct(private TenantResolver $resolver) {}

    /** "HTTPS://Portal.School.edu.bd/login" -> "portal.school.edu.bd" */
    public function normalize(string $input): string
    {
        $d = strtolower(trim($input));
        $d = preg_replace('#^https?://#', '', $d);
        $d = explode('/', $d)[0];
        $d = explode(':', $d)[0];
        return rtrim($d, '.');
    }

    public function add(Institution $institution, string $input, int $userId, bool $skipPlanCheck = false): InstitutionDomain
    {
        $domain = $this->normalize($input);
        $base   = config('tenancy.base_domain');

        $fail = fn (string $m) => throw ValidationException::withMessages(['domain' => $m]);

        if (!preg_match('/^(?=.{4,191}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/', $domain)) {
            $fail('সঠিক domain লিখুন, যেমন portal.yourschool.edu.bd');
        }
        if ($domain === $base || str_ends_with($domain, '.' . $base) || $this->resolver->isCentralHost($domain)) {
            $fail('প্ল্যাটফর্মের নিজস্ব domain ব্যবহার করা যাবে না');
        }
        if (InstitutionDomain::anyInstitution()->where('domain', $domain)->exists()) {
            $fail('এই domain ইতিমধ্যে যুক্ত আছে');
        }
        if (!$skipPlanCheck && $institution->domains()->count() >= config('tenancy.max_domains')) {
            $fail('সর্বোচ্চ ' . config('tenancy.max_domains') . 'টি domain যোগ করা যায়');
        }

        return InstitutionDomain::create([
            'institution_id' => $institution->id,
            'domain'         => $domain,
            'status'         => 'pending_dns',
            'created_by'     => $userId,
        ]);
    }

    /** Returns ['ok' => bool, 'method' => 'cname'|'a'|null, 'reason' => ?string] */
    public function checkDns(string $domain): array
    {
        $target = config('tenancy.cname_target');
        $ip     = config('tenancy.a_target');

        $cnames = @dns_get_record($domain, DNS_CNAME) ?: [];
        foreach ($cnames as $r) {
            if (rtrim(strtolower($r['target'] ?? ''), '.') === $target) {
                return ['ok' => true, 'method' => 'cname', 'reason' => null];
            }
        }

        $ips = array_column(@dns_get_record($domain, DNS_A) ?: [], 'ip');
        if ($ip && $ips === [$ip]) {
            return ['ok' => true, 'method' => 'a', 'reason' => null];
        }

        $reason = match (true) {
            !$cnames && !$ips        => 'কোনো DNS record পাওয়া যায়নি (CNAME বা A record যোগ করুন)',
            (bool) $cnames           => 'CNAME অন্য ঠিকানায় point করছে: ' . ($cnames[0]['target'] ?? ''),
            count($ips) > 1          => 'একাধিক A record আছে — শুধু ' . $ip . ' রাখুন',
            default                  => 'A record অন্য IP-তে point করছে (' . implode(', ', $ips) . ') — Cloudflare proxy চালু থাকলে বন্ধ করুন',
        };
        return ['ok' => false, 'method' => null, 'reason' => $reason];
    }

    public function verify(InstitutionDomain $d): InstitutionDomain
    {
        $result = $this->checkDns($d->domain);
        $d->check_attempts++;
        $d->last_checked_at = now();

        if ($result['ok']) {
            $d->verification_method = $result['method'];
            $d->failure_reason      = null;
            $d->dns_verified_at   ??= now();
            if (in_array($d->status, ['pending_dns', 'failed'], true)) {
                $d->status = config('tenancy.require_approval') ? 'dns_verified' : 'active';
                if ($d->status === 'active') $this->onActivated($d);
            }
        } else {
            $d->failure_reason = $result['reason'];
            if ($d->status === 'pending_dns' && $d->check_attempts >= 30) $d->status = 'failed';
        }
        $d->save();
        return $d;
    }

    public function approve(InstitutionDomain $d, int $superAdminId): void
    {
        abort_unless($d->status === 'dns_verified', 422, 'DNS এখনো যাচাই হয়নি');
        $d->update(['status' => 'active', 'approved_by' => $superAdminId]);
        $this->onActivated($d);
    }

    private function onActivated(InstitutionDomain $d): void
    {
        $d->forceFill(['activated_at' => now()])->save();
        if (!$d->institution->domains()->where('is_primary', 1)->exists()) {
            $d->update(['is_primary' => 1]);
        }
        $this->resolver->forget($d->domain);
        \App\Jobs\WarmDomainCertificate::dispatch($d->id)->delay(now()->addSeconds(10));
        $d->institution->admins()->each->notify(new \App\Notifications\DomainActivated($d));
    }

    public function deactivate(InstitutionDomain $d, string $status, ?string $reason = null): void
    {
        $d->update(['status' => $status, 'is_primary' => 0, 'failure_reason' => $reason]);
        $this->resolver->forget($d->domain);
    }

    /** The URL used in every SMS, email, PDF QR code and payment redirect */
    public function primaryUrl(Institution $institution): string
    {
        $custom = $institution->domains()->where('status', 'active')->where('is_primary', 1)->value('domain');
        return 'https://' . ($custom ?? $institution->slug . '.' . config('tenancy.base_domain'));
    }
}
```

## TLS Check Controller — Full Code
```php
<?php
namespace App\Http\Controllers\Internal;

use App\Models\InstitutionDomain;
use Illuminate\Http\Request;

class TlsCheckController
{
    public function __invoke(Request $request)
    {
        abort_unless(\Symfony\Component\HttpFoundation\IpUtils::checkIp($request->ip(), config('tenancy.internal_ips')), 403);   // CIDR-aware

        $domain = strtolower((string) $request->query('domain'));

        $allowed = InstitutionDomain::anyInstitution()
            ->where('domain', $domain)->where('status', 'active')->exists();

        return response('', $allowed ? 200 : 404);
    }
}
// routes/api.php — OUTSIDE the v1 / tenant groups:
// Route::get('internal/tls-check', \App\Http\Controllers\Internal\TlsCheckController::class);
```
`trustProxies` লাগে না: Nginx `set_real_ip_from 127.0.0.1` দিয়ে আসল client IP ফিরিয়ে আনে এবং FastCGI-তে `REMOTE_ADDR` ও `HTTPS on` পাঠায় (`infra/nginx.conf`), তাই `$request->ip()` ও scheme সঠিক আসে। Caddy-র `ask` request-এ X-Forwarded-For থাকে না, তাই IP = `127.0.0.1`।

## Jobs & Scheduler
| Job | When | What |
|---|---|---|
| `VerifyPendingDomains` | প্রতি ১০ মিনিট | সব `pending_dns` domain-এ `verify()`; ৩০ বার ব্যর্থ (≈৫ ঘণ্টা) হলে `failed` + Admin-কে notification (কারণ সহ)। `failed` domain-এ Admin "Verify again" চাপলে `check_attempts = 0`, `pending_dns` |
| `RecheckActiveDomains` | প্রতিদিন 03:00 | প্রতিটি `active` domain-এ `checkDns()`; পরপর ৩ দিন ব্যর্থ হলে `deactivate($d, 'failed', reason)` + notification। (গণনা: `check_attempts` শূন্য করে প্রতিটি ব্যর্থতায় বাড়ান, সফল হলে শূন্য) |
| `WarmDomainCertificate` | activate-এর ১০ সেকেন্ড পরে; ব্যর্থ হলে ১, ৫, ১৫ মিনিটে retry | `Http::timeout(30)->get("https://{domain}/api/v1/health")` — প্রথম request-এই Caddy certificate ইস্যু করে। সফল হলে `ssl_issued_at = now()` |
| Plan sync | Subscription downgrade/expire event-এ | Plan-এ `custom_domain` না থাকলে সব `active` domain → `disabled`; আবার upgrade করলে `disabled` → `pending_dns` (পুনরায় যাচাই) |

## Frontend
- **`/admin/settings/domain`** (`DomainSettings.jsx`):
  - উপরে: বর্তমান ঠিকানা (default subdomain) + copy বাটন; Pro+ হলে slug পরিবর্তনের form।
  - "Add custom domain" form → যোগ হলে একটি **নির্দেশনা card**: কোন record বসাতে হবে (Host/Name, Type, Value — প্রতিটির পাশে copy বাটন), domain-টি subdomain নাকি root তা দেখে CNAME বা A স্বয়ংক্রিয় দেখায় (নিয়ম: `www.` ছাড়া label সংখ্যা ও পরিচিত suffix `.com.bd`, `.edu.bd`, `.org.bd`, `.net.bd`, `.ac.bd`, `.gov.bd`, `.info.bd` বিবেচনা করে root নির্ধারণ; নিশ্চিত না হলে দুটি বিকল্পই দেখায়)।
  - Status badge (`StatusBadge`): pending_dns হলুদ "DNS-এর অপেক্ষায়", dns_verified নীল "অনুমোদনের অপেক্ষায়", active সবুজ "চালু", failed লাল + `failure_reason`, disabled ধূসর।
  - "Verify now" বাটন; pending অবস্থায় প্রতি ৩০ সেকেন্ডে list refetch।
  - Enterprise না হলে পুরো custom domain অংশে upgrade prompt (`openUpgradeModal`)।
- **`/super-admin/domains`**: approval queue (প্রতিষ্ঠান, domain, method, যাচাইয়ের সময়) → Approve / Reject (কারণ সহ); সব domain-এর list ও filter।
- সব জায়গায় লিংক তৈরি হয় backend-এর `primaryUrl()` থেকে; frontend নিজে base URL জোড়া লাগায় না (`window.location.origin` শুধু বর্তমান পেজের ভেতরের navigation-এ)।

---

# Part C — One-Time Platform Setup (Operator)

## C1. Platform DNS (Cloudflare — schoolapp.com zone)
| Type | Name | Value | Proxy |
|---|---|---|---|
| A | `@` | `<SERVER_IP>` | DNS only (grey cloud) |
| A | `*` | `<SERVER_IP>` | DNS only |
| A | `domains` | `<SERVER_IP>` | DNS only |

- `domains.schoolapp.com` হলো ক্লায়েন্টদের CNAME-এর লক্ষ্য (`DOMAIN_CNAME_TARGET`)। পরে সার্ভার বদলালে শুধু এই একটি record বদলালেই সব ক্লায়েন্টের custom domain নতুন সার্ভারে যায় — এ কারণেই ক্লায়েন্টকে CNAME দিতে বলা উত্তম, A record শুধু root domain-এর জন্য।
- Proxy (কমলা মেঘ) **বন্ধ** রাখুন: Caddy নিজেই certificate নেয়; proxy চালু থাকলে wildcard ও on-demand দুটোই জটিল হয়। (Cloudflare proxy/CDN চাইলে সেটি আলাদা, পরবর্তী সিদ্ধান্ত — "Cloudflare for SaaS"; এই প্ল্যানের অংশ নয়।)

## C2. Cloudflare API Token (wildcard certificate-এর জন্য)
Cloudflare → My Profile → API Tokens → Create Token → template "Edit zone DNS" → Zone Resources: শুধু `schoolapp.com`। Token `/etc/caddy/caddy.env`-এ `CLOUDFLARE_API_TOKEN=…` (permission `600`)।

## C3. Server
```bash
# Firewall: only 22, 80, 443 open. 8080 and 9000 must NOT be reachable from outside.
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable

# Nginx (internal)
mkdir -p /etc/nginx/snippets && cp infra/laravel-fastcgi.conf /etc/nginx/snippets/
cp infra/nginx.conf /etc/nginx/sites-available/schoolapp.conf
ln -s /etc/nginx/sites-available/schoolapp.conf /etc/nginx/sites-enabled/ && rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Caddy with the Cloudflare DNS plugin
xcaddy build --with github.com/caddy-dns/cloudflare --output /usr/bin/caddy
cp infra/Caddyfile /etc/caddy/Caddyfile        # replace schoolapp.com with your base domain
# systemd: add  EnvironmentFile=/etc/caddy/caddy.env  under [Service] (systemctl edit caddy)
caddy validate --config /etc/caddy/Caddyfile && systemctl enable --now caddy
```

## C4. Laravel .env
`APP_BASE_DOMAIN`, `CENTRAL_DOMAINS`, `SUPER_ADMIN_DOMAIN`, `DOMAIN_CNAME_TARGET`, `DOMAIN_A_TARGET`, `DOMAIN_REQUIRE_APPROVAL`, `DOMAIN_MAX_PER_INSTITUTION` — `docs/architecture/environment-variables.md` (Revision 6)।

## C5. Smoke Test
```bash
curl -sI https://schoolapp.com | head -1                         # 200
curl -sI https://dhanmondi-school.schoolapp.com | head -1        # 200 (wildcard cert)
curl -s  https://dhanmondi-school.schoolapp.com/api/v1/bootstrap | head -c 200
curl -s -o /dev/null -w '%{http_code}\n' 'http://127.0.0.1:8080/api/internal/tls-check?domain=unknown.example.com'   # 404
curl -s -o /dev/null -w '%{http_code}\n' http://<SERVER_IP>:8080/                                                    # must FAIL (port closed)
```

## Let's Encrypt Limits
- Wildcard certificate একটিই, তাই subdomain যত খুশি।
- Custom domain প্রতিটি আলাদা registered domain — সীমা প্রতি domain-এ আলাদা, তাই সমস্যা হয় না। একটি account থেকে ৩ ঘণ্টায় ৩০০টির বেশি নতুন order করা যায় না — এ পর্যায়ে পৌঁছানোর সম্ভাবনা নেই।
- ব্যর্থ যাচাই প্রতি hostname-এ ঘণ্টায় ৫ বার পর্যন্ত; `ask` endpoint থাকায় অযাচিত domain-এ চেষ্টা হয় না।

## Local Development
- Tenant subdomain: `http://demo.lvh.me:5173` (`lvh.me` ও তার সব subdomain `127.0.0.1`-এ resolve হয়) — dev `.env`: `APP_BASE_DOMAIN=lvh.me`, `CENTRAL_DOMAINS=lvh.me,admin.lvh.me`।
- Vite `server.proxy`: `'/api' → http://127.0.0.1:8000` with `changeOrigin: false` (Host header অক্ষত রাখতে) এবং `server.allowedHosts: ['.lvh.me', 'portal.test']`।
- Custom domain পরীক্ষা: `/etc/hosts`-এ `127.0.0.1 portal.test` + DB-তে `institution_domains` row (`status = active`)। DNS যাচাইয়ের code test-এ `DomainService::checkDns()` mock করুন।

---

# Part D — Client Guide (প্রতিষ্ঠানকে দেওয়ার জন্য)

> এই অংশটি হুবহু Help page (`/admin/settings/domain` → "কীভাবে করবেন?") ও support document হিসেবে ব্যবহার করুন। `domains.schoolapp.com` ও IP-এর জায়গায় `.env`-এর মান বসবে।

## নিজের ডোমেইনে সফটওয়্যার চালু করার নিয়ম

**যা লাগবে:** (১) আপনার প্রতিষ্ঠানের একটি ডোমেইন (যেমন `yourschool.edu.bd` বা `yourcoaching.com`), (২) সেই ডোমেইনের DNS প্যানেলে ঢোকার সুযোগ — যেখান থেকে ডোমেইন কিনেছেন বা হোস্টিং নিয়েছেন, (৩) Enterprise প্ল্যান।

**কোন ঠিকানা ব্যবহার করবেন?**
- আপনার ডোমেইনে যদি আগে থেকেই ওয়েবসাইট থাকে → একটি সাব-ডোমেইন নিন: `portal.yourschool.edu.bd` (পদ্ধতি ক)। ওয়েবসাইট যেমন আছে তেমনই থাকবে।
- ডোমেইনটি শুধু এই সফটওয়্যারের জন্য → মূল ডোমেইন `yourcoaching.com` (পদ্ধতি খ), সাথে `www`।

### ধাপ ১ — সফটওয়্যারে ডোমেইন যোগ করুন
Admin Panel → Settings → Domain → "Add custom domain" → ঠিকানাটি লিখুন (`https://` ছাড়া) → Save। স্ক্রিনে আপনার জন্য নির্দিষ্ট DNS তথ্য দেখাবে।

### ধাপ ২ — DNS record যোগ করুন

**পদ্ধতি ক: সাব-ডোমেইন (`portal.yourschool.edu.bd`) — CNAME**
| Type | Name / Host | Value / Target | TTL |
|---|---|---|---|
| CNAME | `portal` | `domains.schoolapp.com` | Auto / 3600 |

**পদ্ধতি খ: মূল ডোমেইন (`yourcoaching.com`) — A record**
| Type | Name / Host | Value | TTL |
|---|---|---|---|
| A | `@` | `203.0.113.10` (স্ক্রিনে দেখানো IP) | Auto / 3600 |
| CNAME | `www` | `domains.schoolapp.com` | Auto / 3600 |

মূল ডোমেইনের ক্ষেত্রে সফটওয়্যারে **দুটি** ঠিকানাই যোগ করুন (`yourcoaching.com` ও `www.yourcoaching.com`)। একই নামে আগে থেকে কোনো A / AAAA / CNAME record থাকলে সেটি মুছে দিন।

**কোথায় বসাবেন (প্যানেল অনুযায়ী):**
- **cPanel:** Zone Editor → আপনার ডোমেইনের "Manage" → "Add Record" → Type বেছে Name ও Value দিন। (Name-এ শুধু `portal` লিখলে cPanel নিজে পুরো নাম বানায়; পুরো নাম চাইলে শেষে ডট সহ `portal.yourschool.edu.bd.`)
- **Cloudflare:** DNS → Records → Add record। **Proxy status অবশ্যই "DNS only" (ধূসর মেঘ)** — কমলা মেঘ থাকলে যাচাই ব্যর্থ হবে।
- **Namecheap:** Domain List → Manage → Advanced DNS → Add New Record।
- **GoDaddy:** My Products → DNS → Add New Record।
- **`.bd` / `.edu.bd` (BTCL):** BTCL প্যানেলে সাধারণত শুধু Name Server বসানো যায়, record নয়। তাই record বসবে যেখানে আপনার Name Server আছে — হোস্টিং কোম্পানির cPanel অথবা Cloudflare। হোস্টিং না থাকলে বিনামূল্যে Cloudflare-এ ডোমেইন যোগ করে BTCL প্যানেলে Cloudflare-এর দুটি Name Server বসান, তারপর Cloudflare-এ উপরের record দিন।
- নিজে করতে না পারলে উপরের টেবিলটি আপনার ডোমেইন/হোস্টিং প্রোভাইডারকে পাঠান — তারা ৫ মিনিটে করে দেবে।

### ধাপ ৩ — যাচাই করুন
Settings → Domain-এ ফিরে "Verify now" চাপুন। DNS ছড়াতে সাধারণত ৫–৩০ মিনিট, কখনো কয়েক ঘণ্টা লাগে; সিস্টেম নিজেও প্রতি ১০ মিনিটে পরীক্ষা করে। যাচাই হলে অবস্থা হবে "অনুমোদনের অপেক্ষায়"।

### ধাপ ৪ — চালু হওয়া
আমাদের টিম অনুমোদন দিলে অবস্থা "চালু" হবে এবং SMS/ইমেইল পাবেন। নিরাপদ সংযোগ (SSL/তালা চিহ্ন) স্বয়ংক্রিয়ভাবে ১–২ মিনিটে চালু হয় — আপনাকে কোনো SSL কিনতে বা বসাতে হবে না।

### ধাপ ৫ — ব্যবহার
- নতুন ঠিকানায় একবার নতুন করে লগইন করতে হবে।
- এরপর থেকে SMS, রসিদ ও QR কোডের লিংকে আপনার নিজের ডোমেইন থাকবে।
- পুরনো ঠিকানা (`yourname.schoolapp.com`) আগের মতোই চালু থাকবে।

**সাধারণ সমস্যা**
| সমস্যা | সমাধান |
|---|---|
| "কোনো DNS record পাওয়া যায়নি" | record সেভ হয়েছে কি দেখুন; ৩০ মিনিট অপেক্ষা করে আবার Verify |
| "CNAME অন্য ঠিকানায় point করছে" | Value-তে বানান ভুল; হুবহু `domains.schoolapp.com` দিন |
| "A record অন্য IP-তে…" | Cloudflare-এ কমলা মেঘ বন্ধ করুন; পুরনো A record মুছুন |
| "একাধিক A record আছে" | শুধু আমাদের IP-র record রাখুন |
| ব্রাউজারে "Not secure" | চালু হওয়ার পর ২ মিনিট অপেক্ষা করে রিফ্রেশ করুন |
| ইমেইল (info@yourschool.edu.bd) বন্ধ হবে? | না। সাব-ডোমেইনের CNAME ইমেইলে প্রভাব ফেলে না; মূল ডোমেইনে শুধু A record বদলান, MX record ছোঁবেন না |

---

# Part E — Super Admin Operations
1. **Approval:** `/super-admin/domains` → queue-তে domain-টি প্রতিষ্ঠানের নাম/পরিচয়ের সাথে সঙ্গতিপূর্ণ কি না দেখে Approve। সন্দেহজনক (অন্য প্রতিষ্ঠানের নামের domain) হলে Reject + কারণ।
2. **ক্লায়েন্টের হয়ে যোগ করা:** Institutions → প্রতিষ্ঠান → Domains → Add (plan check এড়িয়ে যায়; Basic/Pro ক্লায়েন্টকে বিশেষ সুবিধা দিতে)।
3. **বন্ধ করা:** Disable — সঙ্গে সঙ্গে resolve বন্ধ; Caddy-তে থাকা certificate মেয়াদ শেষে আর নবায়ন হয় না।
4. **সার্ভার বদল:** নতুন সার্ভারে C3–C5 সম্পন্ন করে `domains` ও `*` A record নতুন IP-তে। CNAME-ব্যবহারকারী ক্লায়েন্টদের কিছু করতে হয় না; A-record ব্যবহারকারীদের (root domain) তালিকা: `institution_domains where verification_method = 'a'` — তাদের নতুন IP জানাতে হবে, এবং `DOMAIN_A_TARGET` হালনাগাদ করতে হবে।
5. **পর্যবেক্ষণ:** `journalctl -u caddy -f` (certificate ইস্যুর log); `active` কিন্তু `ssl_issued_at IS NULL` এমন domain dashboard-এ সতর্কতা হিসেবে।

---

# Part F — Troubleshooting (Operator)
| Symptom | Likely Cause | Fix |
|---|---|---|
| Custom domain-এ TLS error, Caddy log: `ask endpoint returned 404` | Domain `active` নয়, বা `domain` কলামে বড় হাতের অক্ষর/`www` অমিল | DB row দেখুন; `normalize()` ছাড়া insert হয়েছে কি |
| Caddy log: `ask … connection refused` | Nginx 8080 বন্ধ, অথবা `/api/internal/` block নেই | `nginx -t`, `curl 127.0.0.1:8080/api/internal/tls-check?domain=x` |
| `tls-check` সবসময় 403 | Nginx `set_real_ip_from`/`real_ip_header` নেই, বা `fastcgi_param REMOTE_ADDR` অনুপস্থিত — `$request->ip()` ভুল আসছে | `infra/nginx.conf` হুবহু ব্যবহার করুন; `curl 127.0.0.1:8080/api/internal/tls-check?domain=x` |
| Subdomain-এ certificate error | Wildcard cert ইস্যু হয়নি: token ভুল বা plugin ছাড়া Caddy | `caddy list-modules \| grep cloudflare`; token-এর zone permission |
| Domain ঠিক, কিন্তু অন্য প্রতিষ্ঠান খুলছে / 404 | `tenant:host:*` cache পুরনো | `TenantResolver::forget($host)` — status বদলের প্রতিটি পথে call হচ্ছে কি |
| Login-এর পর আবার login পেজ | `VITE_API_URL` absolute — API অন্য origin-এ যাচ্ছে | `/api/v1` relative করুন, rebuild |
| Payment শেষে ভুল সাইটে ফেরত | Callback tenant domain-এ সেট | Callback central domain-এ; শেষে `primaryUrl()`-এ redirect |
| `http://` থেকে `https://`-এ যাচ্ছে না | port 80 firewall-এ বন্ধ | `ufw allow 80` (ACME HTTP-01-এর জন্যও লাগে) |
| ক্লায়েন্টের DNS ঠিক, তবু `pending_dns` | সার্ভারের resolver-এ পুরনো cache | `dig +short CNAME portal.x.edu.bd @1.1.1.1` দিয়ে মিলিয়ে দেখুন; কয়েক মিনিট পর স্বয়ংক্রিয় ঠিক হয় |

---

# Part G — Tests & Done-When

## PHPUnit (`tests/Feature/Tenancy/`)
| Test | Asserts |
|---|---|
| `TenantResolverTest` | slug subdomain resolve হয়; reserved slug ও দুই-স্তরের subdomain (`a.b.schoolapp.com`) `null`; `active` custom domain resolve হয়; `pending_dns`/`dns_verified`/`failed`/`disabled` হয় না; central host-এ tenant bind হয় না |
| `DomainLifecycleTest` | add → `pending_dns`; mock DNS ok → `dns_verified`; approve → `active` + primary + cache forget; `DOMAIN_REQUIRE_APPROVAL=false` হলে সরাসরি `active` |
| `DomainValidationTest` | scheme/path/port সহ input normalize হয়; platform domain, duplicate, সীমার বেশি → 422; `custom_domain` flag ছাড়া → 403 |
| `TlsCheckTest` | active → 200; অন্য সব → 404; non-loopback IP → 403 |
| `DomainPlanSyncTest` | downgrade → `disabled`; subdomain তখনও কাজ করে |
| `CrossTenantHostTest` | Institution A-র token দিয়ে Institution B-র host-এ request → 403 (`institution_mismatch`) |
| `PrimaryUrlTest` | active primary custom domain থাকলে সেটি, নয়তো subdomain |

## Done When
- [ ] C5-এর পাঁচটি smoke test প্রত্যাশিত ফল দেয়।
- [ ] একটি বাস্তব test domain (বা `/etc/hosts` + staging) দিয়ে পুরো flow: add → DNS → verify → approve → HTTPS-এ login সফল, ব্রাউজারে বৈধ certificate।
- [ ] Custom domain-এ login করে fee receipt PDF-এর QR/লিংকে custom domain আসে।
- [ ] Domain `disabled` করার ১০ মিনিটের মধ্যে সেই host `404 institution_not_found` দেয়, কিন্তু subdomain চালু।
- [ ] উপরের সাতটি test class পাস করে।
