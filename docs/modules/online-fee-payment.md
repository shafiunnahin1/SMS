# Online Fee Payment — Hybrid Collection & Settlement (Revision 6.2)

## Overview
অভিভাবক অনলাইনে সন্তানের ফি দিলে টাকা কোথায় যাবে, তা প্রতিষ্ঠানের সেটআপের উপর নির্ভর করে — এটি সিদ্ধান্ত OD-1 (চূড়ান্ত):

| Mode | When | Money goes to | Platform's role |
|---|---|---|---|
| **institution** | প্রতিষ্ঠান নিজের merchant credential সেট করেছে ও সেটি `active` | সরাসরি প্রতিষ্ঠানের নিজের gateway account → তাদের ব্যাংক | শুধু software; টাকা ছোঁয় না |
| **platform** | প্রতিষ্ঠানের নিজস্ব gateway নেই (বা `disabled`) | প্ল্যাটফর্মের merchant account | টাকা সংগ্রহ করে, ledger রাখে, পরে প্রতিষ্ঠানের payout account-এ settle করে |
| *(unavailable)* | উপরের কোনোটিই নয় | — | অভিভাবকের কাছে "অনলাইন পেমেন্ট" বাটন দেখায় না; ক্যাশ/ম্যানুয়াল কালেকশন চলে |

"payments" (প্রতিষ্ঠান → প্ল্যাটফর্ম, subscription) আর "online_payments" (অভিভাবক → প্রতিষ্ঠান, ফি) সম্পূর্ণ আলাদা table ও আলাদা code path। Subscription অংশ `docs/modules/payment-gateways.md`-এ (SSLCommerz, প্ল্যাটফর্মের নিজস্ব credential)।

> **⚠ প্ল্যাটফর্ম-মোড চালুর আগে (মালিকের কাজ, এজেন্টের নয়):** অন্যের টাকা নিজের merchant account-এ সংগ্রহ করে পরে পাঠানো বাংলাদেশে payment service সংক্রান্ত নিয়মের আওতায় পড়তে পারে। Production-এ `PLATFORM_COLLECT_ENABLED=true` করার আগে একজন আইনজীবী/হিসাবরক্ষকের মতামত নিন। Default `false`; false থাকলে প্ল্যাটফর্ম-মোড নিষ্ক্রিয় এবং নিজস্ব gateway ছাড়া প্রতিষ্ঠানে অনলাইন পেমেন্ট অনুপলব্ধ — বাকি সবকিছু (institution mode সহ) চলে।

## Decisions Locked in This Spec
1. **Amount সবসময় server হিসাব করে** due থেকে; client কোনো amount পাঠায় না (শুধু কোন due গুলো দিতে চায়)।
2. **Platform mode চালু হতে হলে** প্রতিষ্ঠানের payout account `verified` থাকতে হবে — নইলে টাকা পাঠানোর ঠিকানা ছাড়া জমে যাবে।
3. **Gateway খরচ প্রতিষ্ঠানের** (settlement থেকে কাটা)। Platform fee (সেবা চার্জ) ঐচ্ছিক, প্রতিষ্ঠানভিত্তিক `institutions.settings.platform_fee_percent`, default `PLATFORM_COLLECT_FEE_PERCENT` (শুরুতে 0)। অভিভাবকের উপর অতিরিক্ত "convenience fee" চাপানো নেই।
4. **Callback সবসময় central domain-এ** (`https://schoolapp.com/api/v1/...`); `?ref=` দিয়ে `online_payments` row, তা থেকে institution, তা থেকে credential।
5. **Gateway = registry-র একটি entry, code-এ হার্ডকোড নয় (R6.4)।** প্রথম release-এ চালু gateway দুটি: bKash ও SSLCommerz (SSLCommerz-এর ভেতর দিয়ে Nagad, কার্ড, নেট ব্যাংকিংও আসে)। **Bangla QR পরে** যুক্ত হবে ব্যাংকের API পেলে — প্রকল্প শেষ হওয়ার পর। সেই কাজ যেন শুধু একটি adapter class + registry entry + `.env` হয়, তাই এখনই নিচের "Extension Seams" বসানো হয়েছে এবং কাজের ধাপ `docs/modules/banglaqr-readiness.md`-এ। সরাসরি Nagad-এর কোড plan-এ নেই; বানাবেন না। 
6. **Refund এই release-এ system-এর বাইরে।** Gateway panel থেকে ম্যানুয়ালি; system-এ কোনো refund flow নেই। (`online_payments.status = 'refunded'` শুধু Super Admin ম্যানুয়ালি সেট করতে পারে এবং তখন সংশ্লিষ্ট settlement draft থাকলে ব্যবধান দেখায়।)
7. **অংশিক পেমেন্ট নেই:** অভিভাবক নির্বাচিত due-গুলোর পুরো পরিমাণ দেয়।

---

## Configuration
`config/payments.php` — সম্পূর্ণ। **Gateway-সংক্রান্ত সবকিছু (লেবেল, flow, ফি, credential-এর ঘর, platform credential) এই এক জায়গায়**; অন্য কোথাও gateway-র নাম তালিকা করা যাবে না (route, enum, validation, UI — সব এখান থেকে)।
```php
<?php
return [
    'platform_collect_enabled' => env('PLATFORM_COLLECT_ENABLED', false),
    'platform_fee_percent'     => (float) env('PLATFORM_COLLECT_FEE_PERCENT', 0),
    'initiated_ttl_minutes'    => 30,    // an 'initiated' row older than this may be replaced by a new attempt
    'reconcile_after_minutes'  => 10,    // reconcile job picks up 'initiated' rows older than this
    'expire_after_hours'       => 24,    // redirect flow: reconcile job gives up and marks 'cancelled'
    'qr_late_grace_minutes'    => 30,    // qr flow: keep listening this long after expires_at before 'cancelled'
    'central_url'              => env('APP_URL'),   // callbacks are built from this, never from the request host

    // Which registry entries are offered to parents. Adding Bangla QR later = add 'banglaqr' here (via .env) + its registry entry.
    'enabled' => array_values(array_filter(explode(',', env('ENABLED_GATEWAYS', 'bkash,sslcommerz')))),

    'gateways' => [
        'bkash' => [
            'label'   => ['bn' => 'bKash', 'en' => 'bKash'],
            'class'   => \App\Services\Payments\Gateways\BkashGateway::class,
            'flow'    => 'redirect',                        // redirect | qr | manual (reserved)
            'sandbox_toggle'  => true,
            'fee_percent'     => (float) env('GATEWAY_FEE_BKASH', 1.5),      // estimate, settlement arithmetic only
            'credential_fields' => [                        // drives the Settings form AND validation; 'secret' => masked, never returned
                ['key' => 'app_key',    'label' => ['bn' => 'App Key',    'en' => 'App Key'],    'secret' => false],
                ['key' => 'app_secret', 'label' => ['bn' => 'App Secret', 'en' => 'App Secret'], 'secret' => true],
                ['key' => 'username',   'label' => ['bn' => 'Username',   'en' => 'Username'],   'secret' => false],
                ['key' => 'password',   'label' => ['bn' => 'Password',   'en' => 'Password'],   'secret' => true],
            ],
            'platform_credentials' => ['app_key' => env('BKASH_APP_KEY'), 'app_secret' => env('BKASH_APP_SECRET'),
                                       'username' => env('BKASH_USERNAME'), 'password' => env('BKASH_PASSWORD'), 'sandbox' => env('BKASH_SANDBOX', true)],
            'callback_urls' => ['callback' => '/api/v1/fees/payment/bkash/callback'],     // shown (copy button) in Settings -> Payments
        ],
        'sslcommerz' => [
            'label'   => ['bn' => 'কার্ড / মোবাইল ব্যাংকিং (SSLCommerz)', 'en' => 'Card / Mobile banking (SSLCommerz)'],
            'class'   => \App\Services\Payments\Gateways\SslCommerzGateway::class,
            'flow'    => 'redirect',
            'sandbox_toggle'  => true,
            'fee_percent'     => (float) env('GATEWAY_FEE_SSLCOMMERZ', 2.0),
            'credential_fields' => [
                ['key' => 'store_id',       'label' => ['bn' => 'Store ID',       'en' => 'Store ID'],       'secret' => false],
                ['key' => 'store_password', 'label' => ['bn' => 'Store Password', 'en' => 'Store Password'], 'secret' => true],
            ],
            'platform_credentials' => ['store_id' => env('SSLCZ_STORE_ID'), 'store_password' => env('SSLCZ_STORE_PASSWD'), 'sandbox' => env('SSLCZ_IS_SANDBOX', true)],
            'callback_urls' => ['success' => '/api/v1/fees/payment/ssl/success', 'fail' => '/api/v1/fees/payment/ssl/fail',
                                'cancel'  => '/api/v1/fees/payment/ssl/cancel',  'ipn'  => '/api/v1/fees/payment/ssl/ipn'],
        ],

        // 'banglaqr' => [ ... ]   RESERVED. Added after the bank/PSP API is obtained - see docs/modules/banglaqr-readiness.md
        //                          (flow 'qr', class BanglaQrGateway, credential_fields = whatever the bank issues)

        // Dev/test only (never registered in production, see GatewayRegistry): 'fakeqr' => ['flow' => 'qr', class FakeQrGateway ...]
    ],
];
```
`GatewayRegistry` (নিচে) এই array পড়ে; `enabled` তালিকার বাইরের entry কখনো parent-কে দেখানো হয় না, কিন্তু এতে থাকা credential ও পুরনো `online_payments` row বহাল থাকে (gateway বন্ধ করলে ইতিহাস হারায় না)।

## Credential Shapes
`institution_payment_gateways.credentials` (decrypted) হলো `config('payments.gateways.{key}.credential_fields')` অনুযায়ী `{key: value}` map। Settings ফর্ম, validation (`required|string|max:255` প্রতি field) এবং masking — সবই ওই `credential_fields` থেকে; **নতুন gateway-র জন্য frontend বা controller বদলাতে হয় না।** আজকের দুটি: bKash = `app_key, app_secret, username, password`; SSLCommerz = `store_id, store_password`।

Model: `InstitutionPaymentGateway` — `$casts = ['credentials' => 'encrypted:array', 'is_sandbox' => 'boolean']`, `$hidden = ['credentials']`। `BelongsToInstitution` ব্যবহার করে। `gateway` কলাম VARCHAR — validation `Rule::in(GatewayRegistry::enabledKeys())`।

## GatewayRegistry & PaymentRouter — Which Gateway, Which Mode
```php
<?php
namespace App\Services\Payments;

use App\Models\{Institution, InstitutionPaymentGateway, InstitutionPayoutAccount};
use Illuminate\Support\Arr;

class GatewayRegistry
{
    /** keys offered to parents. 'fakeqr' exists only outside production (dev sandbox + tests). */
    public static function enabledKeys(): array
    {
        $keys = config('payments.enabled');
        if (!app()->environment('production') && config('payments.gateways.fakeqr')) $keys[] = 'fakeqr';
        return array_values(array_intersect(array_unique($keys), array_keys(config('payments.gateways'))));
    }

    public static function definition(string $key): ?array { return config("payments.gateways.{$key}"); }
    public static function make(string $key): GatewayInterface { return app(self::definition($key)['class']); }
}

class PaymentRouter
{
    /** @return array{mode:'institution'|'platform', credentials:array, sandbox:bool, flow:string}|null */
    public function resolve(Institution $institution, string $gateway): ?array
    {
        if (!in_array($gateway, GatewayRegistry::enabledKeys(), true)) return null;
        $def = GatewayRegistry::definition($gateway);

        // 1. The institution's own, working merchant account always wins
        $own = InstitutionPaymentGateway::anyInstitution()
            ->where('institution_id', $institution->id)->where('gateway', $gateway)->where('status', 'active')->first();
        if ($own) return ['mode' => 'institution', 'credentials' => $own->credentials, 'sandbox' => $own->is_sandbox, 'flow' => $def['flow']];

        // 2. Otherwise the platform collects - only if enabled, allowed for this institution, and it can be paid out
        if (!config('payments.platform_collect_enabled')) return null;
        if (($institution->settings['platform_collect'] ?? true) === false) return null;
        $payout = InstitutionPayoutAccount::anyInstitution()
            ->where('institution_id', $institution->id)->where('status', 'verified')->exists();
        if (!$payout) return null;

        $creds = $def['platform_credentials'] ?? [];
        if (empty(array_filter(Arr::except($creds, ['sandbox'])))) return null;                 // platform has no merchant account for it
        return ['mode' => 'platform', 'credentials' => $creds, 'sandbox' => (bool) ($creds['sandbox'] ?? false), 'flow' => $def['flow']];
    }

    /** For the parent UI: which buttons to show, and which renderer each one needs */
    public function options(Institution $institution): array
    {
        return collect(GatewayRegistry::enabledKeys())->map(function ($g) use ($institution) {
            $r = $this->resolve($institution, $g);
            return $r ? ['gateway' => $g, 'label' => GatewayRegistry::definition($g)['label'], 'mode' => $r['mode'], 'flow' => $r['flow']] : null;
        })->filter()->values()->all();
    }
}
```
Module key `online_payment` (সব type) — `module:online_payment` middleware।

## GatewayInterface (R6.4 — flow-aware)
```php
interface GatewayInterface
{
    /** ['flow' => 'redirect'|'qr', 'notify' => bool (provider calls us), 'query' => bool (we can ask the provider)] */
    public function capabilities(): array;

    /** Start a payment. $p->gateway_ref is the ONLY reference you may send (<= 20 chars, [A-Z0-9]).
     *  redirect: ['flow'=>'redirect', 'payment_url'=>string, 'gateway_payment_id'=>?string]
     *  qr:       ['flow'=>'qr', 'qr_payload'=>string (the EMV string to draw), 'expires_at'=>ISO8601, 'gateway_payment_id'=>?string] */
    public function create(OnlinePayment $p, array $creds, bool $sandbox): array;

    /** Provider -> us (IPN/webhook/callback), step 1: read OUR ref from the request. No secrets are available yet (we do not know the
     *  institution until we have the ref). Return null if there is none. */
    public function extractRef(\Illuminate\Http\Request $request): ?string;

    /** Step 2, with the institution's/platform's credentials loaded from the row: authenticate the request the way the provider
     *  documents (signature / shared secret / source IP). false => the controller answers 403 and nothing is finalized. */
    public function authenticate(\Illuminate\Http\Request $request, OnlinePayment $p, array $creds): bool;

    /** Optional: the HTTP answer the provider expects after a notification (default 200 OK). */
    public function notifyResponse(OnlinePayment $p): \Symfony\Component\HttpFoundation\Response;

    /** Ask the provider for the truth. Returns ['ok'=>bool,'trx_id'=>?string,'amount'=>?float,'channel'=>?string,'raw'=>array,'reason'=>?string].
     *  reason 'pending' = still undecided. $callback is the notification payload (may be empty). Must not trust $callback for the amount. */
    public function confirm(OnlinePayment $p, array $callback, array $creds, bool $sandbox): array;

    /** Same return shape; only called when capabilities()['query'] is true (reconcile job). */
    public function query(OnlinePayment $p, array $creds, bool $sandbox): array;

    /** Settings -> "Test connection". Moves NO money. */
    public function verifyCredentials(array $creds, bool $sandbox): array;   // ['ok'=>bool,'error'=>?string]
}
```
`BkashGateway`, `SslCommerzGateway` — আগের কোড এই interface-এর ভেতরে; credential method argument, `config()` নয়। bKash token cache key `bkash_token:` + `md5(username . app_key . sandbox)`। URL/sandbox host বর্তমান ডকুমেন্টেশন থেকে নিন (এই plan-এ দেওয়া URL যাচাই করা নয়)।

### Extension Seams (এগুলো এখনই বসাতে হবে — Bangla QR-এর কারণে)
| Seam | কী | কেন |
|---|---|---|
| **Registry** (`config/payments.php`) | gateway = config entry; route/validation/UI সব এখান থেকে | নতুন gateway-তে route, enum, form বদলায় না |
| **VARCHAR gateway কলাম** | `online_payments.gateway`, `institution_payment_gateways.gateway`, `fee_payments.payment_method` | migration লাগে না |
| **Flow-aware `create()`** | `redirect` ছাড়াও `qr` রিটার্ন | QR আঁকতে হয়, redirect নয় |
| **`extractRef()` + `authenticate()` + generic notify route** | `POST /api/v1/fees/payment/{gateway}/notify` | নতুন provider-এর IPN-এর জন্য নতুন route নয় |
| **Short `gateway_ref` (20 ch)** | সব provider-কে একই ছোট রেফারেন্স | EMV QR-এর bill-number/reference ফিল্ড ছোট (সাধারণত ≤ ২৫; প্রদানকারীর ডকুমেন্টে মিলিয়ে নিন) |
| **`qr_payload`, `expires_at`, `flow` কলাম** | QR পুনরায় আঁকা, মেয়াদ | পাতা reload করলে একই QR |
| **`review` status** | টাকা কেটেছে কিন্তু ফি জমা হয়নি | QR-এ মেয়াদ শেষে/ভুল অঙ্কে পেমেন্ট ঘটবেই |
| **React `PaymentFlow` + `QrPaymentPanel`** | `flow` অনুযায়ী renderer | QR UI আগে থেকেই আছে |
| **`FakeQrGateway`** (dev/test only) | QR প্রবাহ শেষ পর্যন্ত চালিয়ে দেখা | ব্যাংকের API আসার আগেই QR path প্রমাণিত |

## FakeQrGateway (dev/test only — Bangla QR প্রবাহ আগেই প্রমাণ করার জন্য)
`app/Services/Payments/Gateways/FakeQrGateway.php` — registry-তে `fakeqr` entry শুধু `config/payments.php`-এ `if (!app()->environment('production'))` শর্তে বসে (`GatewayRegistry::enabledKeys()` production-এ কখনো `fakeqr` ফেরত দেয় না — `GatewayRegistryTest`)। আচরণ:
- `capabilities()` = `['flow'=>'qr','notify'=>true,'query'=>true]`
- `create()` → `qr_payload = "FAKEQR|{gateway_ref}|{amount}"`, `expires_at = now()+2 min` (দ্রুত মেয়াদ-পরীক্ষার জন্য), `gateway_payment_id = 'fake-'.{gateway_ref}`
- `extractRef()` → request-এর `ref`; `authenticate()` → `hash_equals(config('app.key'), request header X-Fake-Secret)` (শুধু প্রমাণীকরণ-পথ চালানোর জন্য)
- `query()/confirm()` → `cache("fakeqr:{ref}")`-এ সংরক্ষিত "পেমেন্ট হয়েছে" অবস্থা পড়ে: নেই ⇒ `reason='pending'`; আছে ⇒ `ok=true, amount = cache-এ রাখা অঙ্ক, channel='banglaqr', trx_id='FAKE-…'`
- **Dev সিমুলেটর:** `POST /api/v1/dev/fakeqr/pay { ref, amount? }` (route শুধু non-production-এ নিবন্ধিত) cache-এ অবস্থা বসিয়ে `notify` চালায়; অঙ্ক ভিন্ন দিলে `amount_mismatch` পরীক্ষা হয়। `QrPaymentPanel`-এ dev build-এ একটি "পেমেন্ট সিমুলেট করুন" বাটন (`import.meta.env.DEV`)।
এর উদ্দেশ্য কোনো ব্যাংকের আচরণ নকল করা নয় — শুধু প্রমাণ করা যে `flow='qr'` পথ (আঁকা → poll → notify → finalize → মেয়াদ → late → review) আগে থেকেই শেষ পর্যন্ত কাজ করে।

## OnlinePaymentService — Full Flow
```php
<?php
namespace App\Services\Payments;

use App\Models\{Institution, OnlinePayment, Student, User};
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OnlinePaymentService
{
    public function __construct(private PaymentRouter $router, private FeeService $fees) {}

    /** Parent presses "Pay". $dueKeys = ["{enrollment_id}:{fee_category_id}:{period}", ...] from GET /parent/fees */
    public function initiate(User $parent, Student $student, array $dueKeys, string $gateway): array
    {
        $institution = app('currentInstitution');
        abort_unless($parent->children()->whereKey($student->id)->exists(), 403);              // parent_student link

        $route = $this->router->resolve($institution, $gateway)
            ?? throw ValidationException::withMessages(['gateway' => 'এই পদ্ধতিতে অনলাইন পেমেন্ট এখন চালু নেই']);

        // 1. Amount from the database - the client never sends money values
        $items  = $this->fees->outstandingItems($student, $dueKeys);     // validates each key is an unpaid due of THIS student
        $amount = round(collect($items)->sum('amount'), 2);
        if ($amount < 10) throw ValidationException::withMessages(['dues' => 'ন্যূনতম পেমেন্ট ৳১০']);

        return DB::transaction(function () use ($institution, $parent, $student, $items, $amount, $gateway, $route) {
            // 2. Don't double-charge: an open, unexpired attempt on any of the same dues blocks a new one
            $this->releaseStaleAttempts($student, $items);
            if ($this->hasLiveAttempt($student, $items)) {
                throw ValidationException::withMessages(['dues' => 'এই ফি-র জন্য একটি পেমেন্ট চলমান আছে। কয়েক মিনিট পর আবার চেষ্টা করুন']);
            }

            // 3. Fees (platform mode only) - the percent comes from the registry
            [$gwFee, $platFee] = $route['mode'] === 'platform' ? $this->fees->platformModeFees($institution, $gateway, $amount) : [0, 0];

            $p = OnlinePayment::create([
                'student_id' => $student->id, 'parent_user_id' => $parent->id,
                'gateway' => $gateway, 'flow' => $route['flow'], 'collected_by' => $route['mode'],
                'amount' => $amount, 'gateway_fee' => $gwFee, 'platform_fee' => $platFee,
                'net_amount' => round($amount - $gwFee - $platFee, 2),
                'status' => 'initiated', 'items' => $items,
                'gateway_ref' => $this->newRef(),
            ]);

            // 4. Ask the provider. The adapter decides what comes back: a page to open (redirect) or a QR to draw (qr)
            $res = GatewayRegistry::make($gateway)->create($p, $route['credentials'], $route['sandbox']);
            $p->update([
                'gateway_payment_id' => $res['gateway_payment_id'] ?? null,
                'qr_payload'         => $res['qr_payload'] ?? null,
                'expires_at'         => isset($res['expires_at']) ? \Carbon\Carbon::parse($res['expires_at']) : null,
            ]);

            return array_filter([
                'flow' => $res['flow'], 'ref' => $p->gateway_ref, 'mode' => $route['mode'],
                'payment_url' => $res['payment_url'] ?? null,                       // flow = redirect
                'qr_payload'  => $res['qr_payload'] ?? null,                        // flow = qr
                'expires_at'  => $p->expires_at?->toISOString(),
            ], fn ($v) => $v !== null);
        });
    }

    /** 20 chars, [A-Z0-9], unguessable. Same value goes to every provider (invoice no. / tran id / QR bill number). */
    private function newRef(): string
    {
        do { $ref = 'F' . strtoupper(Str::random(19)); $ref = preg_replace('/[^A-Z0-9]/', 'X', $ref); }
        while (OnlinePayment::anyInstitution()->where('gateway_ref', $ref)->exists());
        return $ref;
    }

    /** Browser callback / provider notification / reconcile job - ONE function, safe to call any number of times.
     *  Runs on the central host or in a worker, i.e. with NO tenant: it finds the row across institutions, then does all the real
     *  work inside Tenancy::as() so the binding is restored afterwards (a worker must never keep a tenant between jobs). */
    public function finalize(string $ref, array $callback = [], bool $fromQuery = false): OnlinePayment
    {
        $institutionId = Tenancy::withoutTenancy(fn () => OnlinePayment::anyInstitution()->where('gateway_ref', $ref)->value('institution_id'))
            ?? abort(404);

        return Tenancy::as(Institution::findOrFail($institutionId), fn (Institution $institution) => DB::transaction(function () use ($ref, $callback, $fromQuery, $institution) {
            $p = OnlinePayment::where('gateway_ref', $ref)->lockForUpdate()->firstOrFail();          // tenant-scoped now
            if (in_array($p->status, ['success', 'refunded', 'review'], true)) return $p;          // already decided: idempotent

            // Use the credentials of the mode used at initiation (a credential may have been disabled meanwhile)
            $creds = $p->collected_by === 'institution'
                ? $this->institutionCredentials($institution, $p->gateway)
                : GatewayRegistry::definition($p->gateway)['platform_credentials'];
            $sandbox = (bool) ($creds['sandbox'] ?? $this->institutionSandbox($institution, $p->gateway));

            $gw  = GatewayRegistry::make($p->gateway);
            $res = $fromQuery ? $gw->query($p, $creds, $sandbox) : $gw->confirm($p, $callback, $creds, $sandbox);

            if (($res['reason'] ?? null) === 'pending') return $p;                                // still undecided: leave as is

            // A row we already gave up on (failed / cancelled / expired QR) can still receive real money later.
            $closed = in_array($p->status, ['failed', 'cancelled'], true);
            if (!$res['ok']) {
                if (!$closed) $p->update(['status' => 'failed', 'failure_reason' => Str::limit($res['reason'] ?? 'failed', 250), 'raw_response' => $res['raw'] ?? null]);
                return $p;
            }

            // The provider says money was taken. From here on NEVER mark the row 'failed' - money exists.
            $amountOk = abs(($res['amount'] ?? 0) - (float) $p->amount) <= 0.009;
            if (!$amountOk || $closed) {
                $p->update(['status' => 'review', 'trx_id' => $res['trx_id'] ?? null, 'channel' => $res['channel'] ?? $p->channel,
                            'failure_reason' => !$amountOk ? 'amount_mismatch' : 'late_payment',   // late_payment = right amount, but after we had closed the attempt
                            'raw_response' => $res['raw'] ?? null]);
                AuditLog::record('online_payment.needs_review', $p);                              // + in-app/email to Super Admin and the institution Admin
                return $p;
            }
            $p->channel = $res['channel'] ?? $p->channel;

            // Success: write the fee lines, same receipt on all of them
            $this->fees->recordOnlinePayment($p, $res['trx_id']);                                 // fee_payments rows, receipt_no, paid_at, status = success
            \App\Jobs\SendOnlinePaymentReceipt::dispatch($p->id, $institution->id)->afterCommit();
            return $p;
        }));
    }

    /** Super Admin resolves a 'review' row. accept_as_paid: only for late_payment (amount was right) - credits the dues if they are still unpaid; mark_refunded: money was returned outside the system. */
    public function resolveReview(OnlinePayment $p, string $action, ?string $note = null): OnlinePayment
    {
        abort_unless($p->status === 'review', 422);
        // Called from the Super Admin screen (central host, no tenant): act as the payment's institution for the write
        return Tenancy::as(Institution::findOrFail($p->institution_id), fn () => DB::transaction(function () use ($p, $action, $note) {
            if ($action === 'accept_as_paid') {
                abort_unless($p->failure_reason === 'late_payment', 422, 'শুধু সঠিক অঙ্কে দেরিতে আসা পেমেন্ট গ্রহণ করা যায়; অঙ্ক না মিললে ফেরত দিন');
                $this->fees->recordOnlinePayment($p, $p->trx_id);                                  // dues must still be unpaid, else 422 inside
            } else {
                $p->update(['status' => 'refunded', 'failure_reason' => $note]);
            }
            AuditLog::record("online_payment.review_{$action}", $p);
            return $p->refresh();
        }));
    }
}
```
`FeeService` অতিরিক্ত method (সম্পূর্ণ code `docs/templates/laravel-core-files.md`-এর `FeeService`-এর ধারায়, `docs/modules/academic-structure.md` "Fee Resolution" ব্যবহার করে):
- `outstandingItems(Student, array $dueKeys): array` — প্রতিটি key কোনো unpaid due-এর সাথে মিলতে হবে এবং Student-এর নিজের enrollment হতে হবে; amount = ওই মুহূর্তের resolved amount (waiver/discount/late fee প্রয়োগের পর)।
- `platformModeFees(Institution, gateway, amount): [gatewayFee, platformFee]` — উপরের "Decisions" ৩।
- `recordOnlinePayment(OnlinePayment, trxId)` — প্রতিটি item-এর জন্য একটি `fee_payments` row: `payment_method` = gateway, `paid_amount` = item amount, `enrollment_id`, `batch_id`, `online_payment_id`। সবার `receipt_no` এক, `line_no` = ১..n। তারপর `OnlinePayment` → `success`, `trx_id`, `paid_at`। পুরো কাজ একটি transaction-এ।

> **Receipt = একাধিক line।** `fee_payments`-এর unique key এখন `(institution_id, receipt_no, line_no)` (`schema.sql`)। পুরনো `(institution_id, receipt_no)` এক receipt = এক row ধরত এবং কোচিংয়ে দুই batch-এর ফি একসাথে নেওয়া অসম্ভব করত। ক্যাশ কালেকশনের `FeeService::collect()`-ও একই নিয়মে চলবে: একসাথে নেওয়া সব due একটি `receipt_no` ও `line_no` ১..n পায়। Receipt PDF একই `receipt_no`-র সব line একসাথে ছাপে।

### Reconcile Job (callback হারালে, বা QR-এর মেয়াদ শেষে)
`ReconcileOnlinePayments` — প্রতি ৫ মিনিটে, `status='initiated'` row নিয়ে:
- **flow = redirect:** `initiated_at < now() − reconcile_after_minutes` হলে এবং adapter-এর `capabilities()['query']` সত্য হলে `finalize($ref, [], fromQuery: true)`; `initiated_at < now() − expire_after_hours` ও তখনও pending হলে `status='cancelled'`।
- **flow = qr:** `expires_at` পর্যন্ত শুধু notification/`query` শোনে; `expires_at + qr_late_grace_minutes` পার হলে (এবং `query` তখনও paid বলেনি) `status='cancelled'`। এরপর টাকা এলে `finalize()` সেটিকে `review / late_payment`-এ নেয় — টাকা হারায় না, আবার ফি-ও ভুলে জমা হয় না।
- Provider-এ `query` না থাকলে (`capabilities()['query'] = false`) reconcile শুধু মেয়াদ শেষের কাজটুকু করে; পেমেন্ট নিষ্পত্তি নির্ভর করে provider-এর notification-এর উপর, তাই সেই provider-এর জন্য notification হারালে Super Admin-এর "Verify with provider" বাটন (ম্যানুয়াল `confirm()` call) থাকতে হবে।
- প্রতিটি tenant-এর জন্য আলাদা নয় — row থেকেই institution বের হয় (`finalize` নিজে bind করে)।

---

## Callback & Notification Endpoints (Central Host, Public)
```
# Existing providers keep the URL shapes their own documentation requires:
GET  /api/v1/fees/payment/bkash/callback?ref={gateway_ref}&paymentID=…&status=…
POST|GET /api/v1/fees/payment/ssl/success | /fail | /cancel   (form post from SSLCommerz; ref arrives as value_a)
POST /api/v1/fees/payment/ssl/ipn                             (server-to-server)

# R6.4 - generic, for EVERY future provider (Bangla QR included). No new route is needed when a gateway is added:
POST /api/v1/fees/payment/{gateway}/notify                    (server-to-server notification / webhook; GET also accepted)
```
`FeePaymentCallbackController::notify(Request, string $gateway)`: (১) `$gateway` registry-র `enabledKeys()`-এ না থাকলে `404`; (২) `$ref = $adapter->extractRef($request)` — secret ছাড়া শুধু ref পড়ে; `null` হলে `404`; (৩) row থেকে institution ও credential বের করে `$adapter->authenticate($request, $row, $creds)` — মিথ্যা হলে `403`, কিছু finalize হয় না; (৪) `finalize($ref, $request->all())`; (৫) উত্তর `$adapter->notifyResponse($row)` (default `200 OK`)। `finalize` শেষ পর্যন্ত `confirm()` দিয়ে provider-কে জিজ্ঞাসা/যাচাই করে, তাই জাল notification অর্থ জমা করাতে পারে না।

প্রতিটি endpoint: `finalize($ref, $request->all())` → তারপর `redirect(DomainService::primaryUrl($institution) . '/parent/fees?success=1&ref=…')` (ব্যর্থ হলে `?failed=1&reason=…`; `review` হলে `?pending=1` — অভিভাবককে "যাচাই চলছে" দেখান)। `ref` অজানা হলে `404`। Callback কোনো amount বা status মেনে নেয় না — `confirm()` provider-কে জিজ্ঞাসা করে। এগুলো subscription-এর `/billing/ssl/*` থেকে আলাদা path ও আলাদা controller।

> **Institution mode-এ প্রতিষ্ঠানকে নিজের merchant panel-এ callback/notification URL নিবন্ধন করতে হতে পারে।** Settings → Payments পেজে প্রতিটি gateway-র পাশে copy-বাটনসহ registry-র `callback_urls` (পুরো URL = `APP_URL` + path) দেখান। প্রতিষ্ঠানের নিজের domain নয়, **central domain** — স্পষ্ট লিখুন।

---

## Settlement (Platform Mode Only)
প্ল্যাটফর্ম যে টাকা সংগ্রহ করেছে তা প্রতিষ্ঠানের পাওনা — প্ল্যাটফর্মের আয় নয়। `settlements` table এই দায় ট্র্যাক করে।

```
platform-mode payment success ──▶ online_payments (collected_by=platform, settlement_id NULL)   ← "unsettled liability"
        │
        ▼  Super Admin: Generate (প্রতিষ্ঠান + তারিখ-সীমা)   [অথবা সাপ্তাহিক scheduler draft বানায়]
   settlements: draft   ← payments-এ settlement_id বসে (দুবার অন্তর্ভুক্ত হয় না); gateway fee/platform fee সংশোধন করা যায়
        │  Super Admin: Approve  → payout_snapshot (payout account) জমা হয়
        ▼
   approved
        │  Super Admin: Mark paid { method, reference }  (ব্যাংক/bKash-এ টাকা পাঠানোর পর)
        ▼
   paid  → প্রতিষ্ঠানকে SMS + in-app notification; প্রতিষ্ঠানের Admin/Accountant /admin/payments/settlements-এ দেখে
```
- `SettlementService::generate(Institution, from, to)`: `collected_by='platform' AND status='success' AND settlement_id IS NULL AND paid_at BETWEEN` — একটি transaction-এ row lock করে। শূন্য হলে 422।
- সূত্র: `gross = Σ amount`, `gateway_fee_total = Σ gateway_fee`, `platform_fee_total = Σ platform_fee`, `net_payable = gross − gateway_fee_total − platform_fee_total`।
- Draft বাতিল: `DELETE /super/settlements/{id}` (শুধু draft) → payments-এর `settlement_id` NULL ফিরে আসে।
- `approved`/`paid` settlement অপরিবর্তনীয়; ভুল হলে নতুন সংশোধনী settlement (negative adjustment) নয় — note-সহ পরের settlement-এ সমন্বয়। (প্রথম release-এ ম্যানুয়াল।)
- Scheduler: `settlements:draft` প্রতি সোমবার ০৯:০০ — প্রতিটি প্রতিষ্ঠানের জন্য গত সপ্তাহ পর্যন্ত unsettled থাকলে draft। অনুমোদন ও পাঠানো সবসময় ম্যানুয়াল।
- **দায়ের রিপোর্ট** `GET /super/reports/settlement-liability`: প্রতিষ্ঠানভিত্তিক `Σ net_amount where collected_by=platform and status=success and settlement_id IS NULL` + draft/approved অপরিশোধিত সমষ্টি। Super Admin Dashboard-এ আলাদা কার্ড — "আপনার আয়" থেকে স্পষ্ট ভিন্ন রঙে/শিরোনামে; এই অঙ্ক revenue report-এ যোগ হয় না (revenue = শুধু `payments` + platform fee)।
- Platform fee আয় হিসেবে গণ্য হয় settlement `paid` হওয়ার সময়।

---

## API Endpoints
```
# Parent  (module:online_payment, role:parent)
GET    /parent/fees/payment-options                   → [{gateway, label:{bn,en}, mode:'institution'|'platform', flow:'redirect'|'qr'}]  (empty = hide the Pay button)
POST   /fees/payment/{gateway}/create                 → { student_id, dues:["12:3:2026-10",…] }   {gateway} = any key from the registry's enabled list
                                                         → redirect: { flow, ref, mode, payment_url }   |   qr: { flow, ref, mode, qr_payload, expires_at }
GET    /parent/online-payments/{ref}                  → { status, flow, receipt_no?, qr_payload?, expires_at? }   (qr_payload/expires_at only while status = initiated: redraws the QR after a reload)
# Institution Admin  (role:admin; Accountant: read-only GET)
GET    /admin/payments                              → online_payments list (filters: status, gateway, date, student)
GET    /admin/payments/{id}
GET    /admin/payments/settlements                  → this institution's settlements
GET    /admin/settings/payments                     → { available_gateways:[{key,label,flow,sandbox_toggle,credential_fields:[{key,label,secret}],callback_urls}]   ← from the registry, the form is built from this
                                                          gateways:[{gateway,status,credentials_hint,is_sandbox,last_error,last_checked_at}], payout_account:{…masked…}, effective_mode:{bkash:'institution'|'platform'|null, sslcommerz:…} }
PUT    /admin/settings/payments/gateways/{gateway}  → { credentials:{…keys exactly as credential_fields…}, is_sandbox, password }   (re-auth with the admin's password; saved as 'pending')
POST   /admin/settings/payments/gateways/{gateway}/test     → runs verifyCredentials(); ok ⇒ status 'active', else 'failed' + last_error
DELETE /admin/settings/payments/gateways/{gateway}          → disable (parents fall back to platform mode if allowed)
PUT    /admin/settings/payments/payout-account      → bank/bKash details (status resets to 'pending')

# Super Admin  (central host)
GET    /super/online-payments                       → all, filter institution/status/mode
GET    /super/payout-accounts?status=pending        PUT /super/payout-accounts/{id}  { status: verified|rejected, reject_reason? }
GET    /super/settlements                           POST /super/settlements/generate { institution_id, from, to }
GET    /super/settlements/{id}                      PUT /super/settlements/{id}   (draft only: fees, note)
POST   /super/settlements/{id}/approve              POST /super/settlements/{id}/pay { method, reference }
DELETE /super/settlements/{id}                      (draft only)
GET    /super/reports/settlement-liability
PUT    /super/institutions/{id}                     → also settings.platform_collect (bool) and settings.platform_fee_percent
GET    /super/online-payments?status=review         → payments needing a human (amount_mismatch | late_payment)
POST   /super/online-payments/{id}/resolve          → { action: accept_as_paid | mark_refunded, note? }
POST   /super/online-payments/{id}/verify           → ask the provider again (manual confirm()); for providers without a status API
```
Credential এন্ডপয়েন্টের নিয়ম: response-এ credential কখনো ফেরত আসে না (শুধু `credentials_hint`); `PUT` password পুনরায় যাচাই করে; প্রতিটি পরিবর্তন `audit_logs`-এ (মান ছাড়া, শুধু "changed") ও Admin-এর ফোনে SMS; `test` route `throttle:5,1`।

---

## UI
**Parent (`/parent/fees`):** বকেয়ার তালিকায় checkbox; "পরিশোধ করুন" → gateway বাছাই (শুধু `payment-options`-এ যেগুলো আছে, লেবেল সহ)। নিচে স্পষ্ট নোট:
- institution mode: "আপনার পেমেন্ট সরাসরি প্রতিষ্ঠানের অ্যাকাউন্টে যাবে।"
- platform mode: "পেমেন্ট {Platform Name}-এর মাধ্যমে প্রক্রিয়াকৃত হবে এবং প্রতিষ্ঠানকে পরিশোধ করা হবে।"

**`components/payments/PaymentFlow.jsx` — flow অনুযায়ী renderer (এখনই বানাতে হবে):**
```jsx
const RENDERERS = {
  redirect: ({ result }) => { window.location.href = result.payment_url; return <Loader/> },   // today's bKash / SSLCommerz
  qr:       QrPaymentPanel,                                                                      // Bangla QR later; FakeQrGateway now
  // manual: reserved
}
export default function PaymentFlow({ result }) { const R = RENDERERS[result.flow]; return <R result={result} /> }
```
**`QrPaymentPanel`:** `qrcode.react` দিয়ে `qr_payload` আঁকে (বড়, কনট্রাস্টযুক্ত, মোবাইলে ফুল-উইডথ); অঙ্ক ও কাউন্টডাউন (`expires_at`); নিচে "অ্যাপে স্ক্যান করুন" নির্দেশনা; প্রতি ৩ সেকেন্ডে `GET /parent/online-payments/{ref}` poll — `success` হলে রসিদ, `expires_at` পার হলে "মেয়াদ শেষ — নতুন QR নিন" বাটন (নতুন `create`)। পাতা reload করলে একই `ref` থেকে একই QR আবার আঁকে। QR-এর পাশে প্রদানকারী/স্কিমের লোগো বসানোর একটি slot রাখুন (Bangla QR-এর লোগো-নিয়ম ব্যাংকের কাছ থেকে নিশ্চিত করে — `banglaqr-readiness.md`)। এটি **এখনই** বানাতে হবে এবং dev-এ `FakeQrGateway` দিয়ে পরীক্ষা করতে হবে, যাতে ব্যাংকের API আসার দিন UI-তে হাত দিতে না হয়।

ফেরার পর (redirect flow) `?success=1&ref=…` হলে ~৩০ সেকেন্ড `GET /parent/online-payments/{ref}` poll (IPN দেরিতে এলে), তারপর receipt বাটন; `?pending=1` হলে "যাচাই চলছে, ফলাফল SMS-এ জানানো হবে"।

**Institution Admin — `/admin/settings/payments`:** **ফর্ম গঠিত হয় `available_gateways` থেকে** — প্রতিটি gateway-র card: `credential_fields` অনুযায়ী ঘর (`secret` হলে মাস্ক), Sandbox toggle (যদি `sandbox_toggle`), "Test connection", status badge, `callback_urls` (copy); এর ফলে নতুন gateway যোগ করলে এই পাতা অপরিবর্তিত। (২) Payout account ফর্ম + verification status; (৩) "বর্তমানে অনলাইন ফি কোথায় যাচ্ছে" সারাংশ (প্রতিটি gateway-র effective mode)। `/admin/payments` ও `/admin/payments/settlements` — তালিকা; `review` অবস্থার row আলাদা ব্যাজে।

**Super Admin:** `/super-admin/payout-accounts` (verify queue), `/super-admin/settlements` (generate/approve/pay), `/super-admin/online-payments` (সব + **"যাচাই প্রয়োজন" ট্যাব**: `review` row-এ resolve / provider-কে আবার জিজ্ঞাসা), Dashboard-এ "প্রতিষ্ঠানের পাওনা (unsettled)" ও "যাচাই প্রয়োজন" কার্ড, Institution detail-এ platform-collect টগল ও fee %।

## Security
- Credential encrypted at rest (`APP_KEY`); **`APP_KEY` কখনো rotate করবেন না** `payments:reencrypt` command (পুরনো key দিয়ে decrypt → নতুন key দিয়ে encrypt) ছাড়া — নইলে সব credential হারাবে। Backup-এ `APP_KEY` আলাদা নিরাপদ জায়গায়।
- `credentials`, `account_number` কখনো log, exception message, API response বা Sentry payload-এ নয় (`Sentry before_send`-এ `credentials`, `account_number`, `password`, `app_secret`, `store_password` scrub)।
- শুধু `role:admin` credential লিখতে পারে; Accountant, Teacher নয়।
- Callback/IPN অপ্রমাণিত — সবসময় gateway-কে পুনরায় জিজ্ঞাসা (`confirm`); `finalize` idempotent ও row-locked।
- Amount মিলের চেক; `amount_mismatch` Super Admin alert।
- Rate limit: `create` প্রতি parent ৫/মিনিট; callback endpoint IP-ভিত্তিক ৬০/মিনিট।
- Super Admin-এর settlement কাজ audit log-এ (কে approve, কে pay)।

## Notifications
- সফল পেমেন্ট: অভিভাবকের SMS (receipt নম্বরসহ) + in-app; প্রতিষ্ঠানের Admin/Accountant-এর in-app।
- ব্যর্থ/amount mismatch: Super Admin in-app + email।
- Settlement `paid`: প্রতিষ্ঠানের Admin-কে SMS + in-app।
- Gateway `failed` (test ব্যর্থ বা live পেমেন্টে auth error ৩ বার পরপর): Admin-কে in-app; `status='failed'` — তখন platform mode-এ fallback হয় (যদি অনুমোদিত) এবং সেটি Settings-এ স্পষ্ট দেখায়।

## Tests (`tests/Feature/Payments/`)
| Test | Asserts |
|---|---|
| `PaymentRouterTest` | নিজস্ব active gateway থাকলে `institution`; নইলে platform শর্তগুলো (flag, institution allow, verified payout, platform creds) সব থাকলে `platform`, একটিও না থাকলে `null`; `failed`/`pending` gateway কখনো ব্যবহার হয় না; `enabled` তালিকার বাইরের gateway সবসময় `null` |
| `GatewayRegistryTest` | `enabledKeys()` শুধু `ENABLED_GATEWAYS`; `fakeqr` production-এ কখনো নেই; প্রতিটি registry entry-র `class` `GatewayInterface` implement করে; `credential_fields`-এ `key/label/secret` আছে |
| `OnlinePaymentInitiateTest` | client amount উপেক্ষিত; অন্যের সন্তানের due → 403; ইতিমধ্যে paid due → 422; একই due-তে দুটি live attempt → দ্বিতীয়টি 422; মেয়াদ শেষের পর নতুন attempt সম্ভব; `< ৳১০` → 422; `gateway_ref` ঠিক ২০ অক্ষর `[A-Z0-9]` ও unique |
| `OnlinePaymentFinalizeTest` | সফল → একাধিক `fee_payments` line একই `receipt_no`, `line_no` ১..n; `finalize` দুবার/IPN+callback একসাথে → একবারই লেখে; gateway "pending" → `initiated` থাকে; callback central host-এ কাজ করে এবং tenant bind করে |
| `ReviewFlowTest` (R6.4) | টাকা কেটেছে কিন্তু অঙ্ক ভিন্ন → `review/amount_mismatch` (**কখনো `failed` নয়**), কোনো `fee_payments` নেই; `cancelled` row-এ পরে সফল notification → `review/late_payment`; `resolveReview(accept_as_paid)` শুধু `late_payment`-এ, dues তখনও অপরিশোধিত থাকলে; `mark_refunded` → `refunded`; `review` row settlement-এ ঢোকে না; Super Admin ও Admin-এর notification |
| `ModeStabilityTest` | initiation-এর পর gateway disable হলেও finalize প্রাথমিক mode-এর credential ব্যবহার করে |
| `FeeSplitTest` | platform mode: `net = amount − gateway_fee − platform_fee` (fee % registry থেকে); institution mode: ০/০ |
| `NotifyEndpointTest` (R6.4) | `POST /fees/payment/{gateway}/notify`: অজানা/disabled gateway → 404; `extractRef` null → 404; `authenticate` false → 403 ও কিছু finalize হয় না; সঠিক হলে finalize ও `notifyResponse` |
| `QrFlowTest` (R6.4, `FakeQrGateway`) | `create` → `flow='qr'`, `qr_payload`, `expires_at` সংরক্ষিত; `GET /parent/online-payments/{ref}` মেয়াদের মধ্যে একই `qr_payload` দেয়; notify → success ও রসিদ; মেয়াদ শেষে reconcile → `cancelled`; তারপর notify → `review/late_payment`; payload-এ ঠিক `gateway_ref` ও অঙ্ক |
| `RegistryExtensibilityTest` (R6.4) | একটি নতুন registry entry + adapter class যোগ করলে (test-এর ভেতরে runtime-এ) কোনো migration, route বা controller বদল ছাড়াই: options-এ আসে, create/notify/finalize চলে, Settings payload-এ credential ঘর আসে |
| `SettlementTest` | generate শুধু unsettled+success+platform; দুবার generate → একই payment দুবার নয়; draft delete → মুক্ত; approved অপরিবর্তনীয়; `pay` → paid + notification; liability report revenue-এ যোগ হয় না |
| `CredentialSecurityTest` | API response ও log-এ credential নেই; অন্য tenant-এর Admin পড়তে/লিখতে পারে না; Accountant 403; ভুল password → 403; DB-তে কলাম plain text নয়; `credentials` শুধু registry-র `credential_fields` key গ্রহণ করে |
| `ReconcileTest` | redirect: callback ছাড়া `initiated` row `query` দিয়ে নিষ্পত্তি; ২৪ ঘণ্টা পর pending → cancelled; qr: `expires_at + grace` পর → cancelled; `query=false` adapter-এ শুধু মেয়াদ-কাজ |
| `GatewayContractTest` | **registry-র প্রতিটি gateway-র উপর লুপ** (sandbox বা `Http::fake`): `capabilities/create/extractRef/authenticate/confirm/verifyCredentials` সঠিক shape; `create` শুধু `gateway_ref` ব্যবহার করে |

## Done When
- [ ] দুই demo tenant: (ক) নিজস্ব bKash sandbox credential সেট → পেমেন্ট `collected_by=institution`, `settlements`-এ ঢোকে না; (খ) credential নেই, platform enabled + payout verified → `collected_by=platform`, settlement-এ আসে।
- [ ] তিনটি due একসাথে দিলে একটি receipt PDF-এ তিনটি line।
- [ ] Callback হারিয়ে গেলে reconcile job ১৫ মিনিটের মধ্যে পেমেন্ট নিষ্পত্তি করে।
- [ ] Super Admin: generate → approve → pay; প্রতিষ্ঠান নিজের panel-এ দেখে; liability কার্ড শূন্যে নামে।
- [ ] `PLATFORM_COLLECT_ENABLED=false`-এ নিজস্ব gateway ছাড়া প্রতিষ্ঠানে Pay বাটন নেই, কিন্তু নিজস্ব gateway-ওয়ালা প্রতিষ্ঠানে আছে।
- [ ] **Bangla QR প্রস্তুতি (R6.4):** dev-এ `ENABLED_GATEWAYS=bkash,sslcommerz` রেখেও `fakeqr` দিয়ে পুরো QR প্রবাহ ব্রাউজারে চলে — QR আঁকা, কাউন্টডাউন, notify-এ সফল, মেয়াদ শেষে নতুন QR, reload-এ একই QR; `review` ট্যাবে একটি জাল দেরিতে-আসা পেমেন্ট resolve করা যায়।
- [ ] **প্রমাণ:** `RegistryExtensibilityTest` পাস — অর্থাৎ ব্যাংকের API এলে `BanglaQrGateway` + registry entry + `.env` ছাড়া আর কিছু লাগবে না।
- [ ] উপরের test class গুলো পাস।
