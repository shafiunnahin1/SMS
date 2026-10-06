# Bangla QR — Readiness & Integration Runbook (Revision 6.4)

## Decision
Bangla QR **এই প্রকল্প শেষ হওয়ার পরে** যুক্ত হবে, যখন ব্যাংক/PSP-র API পাওয়া যাবে। তাই এখন দুটি কাজ:
1. **এখন (প্রকল্পের ভেতরে):** `docs/modules/online-fee-payment.md`-এর "Extension Seams" সব বসানো — গেটওয়ে registry, flow-aware interface, generic notify route, VARCHAR কলাম, ছোট রেফারেন্স, `review` status, React `PaymentFlow`/`QrPaymentPanel`, এবং `FakeQrGateway` দিয়ে QR প্রবাহ শেষ পর্যন্ত পরীক্ষা।
2. **পরে (এই ফাইলের Part C):** ব্যাংকের API পেলে যা করতে হবে — একটি adapter class, একটি registry entry, `.env`, sandbox পরীক্ষা, চালু।

লক্ষ্য: Part C-র কাজে **কোনো migration, route, controller, settings পাতা বা Parent UI বদলাতে হবে না**। এটি `RegistryExtensibilityTest` প্রমাণ করে।

---

## Part A — Bangla QR সম্পর্কে যা জানা আছে (যাচাইকৃত উৎস থেকে)
- Bangla QR হলো Bangladesh Bank-এর জাতীয় interoperable QR স্ট্যান্ডার্ড; EMVCo-র **merchant-presented** QR স্পেসিফিকেশন অনুসারে। প্রতিষ্ঠান (merchant) QR দেখায়, গ্রাহক নিজের ব্যাংক/MFS অ্যাপ দিয়ে স্ক্যান করে।
- **এটি gateway নয়, স্কিম।** QR তৈরি করে ও টাকা settle করে অ্যাকোয়ারার (ব্যাংক বা PSP)। আপনাকে ওদের কাছ থেকে merchant হিসেবে নিবন্ধিত হয়ে API নিতে হবে। (প্ল্যাটফর্ম-মোডে আপনি merchant; প্রতিষ্ঠান-মোডে প্রতিষ্ঠান নিজেই।)
- QR দুই ধরনের: **static** (অঙ্ক গ্রাহক বসায়; EMV tag "Point of Initiation" = `11`) এবং **dynamic** (অঙ্ক ও রেফারেন্স QR-এ বসানো; = `12`)। অনলাইন ফি-র জন্য **dynamic** দরকার।
- ২০২১-এর গাইডলাইনে static QR-এ একজনের লেনদেনসীমা ছিল ২০,২০০ টাকা। এখন কত তা ব্যাংকের কাছ থেকে নিশ্চিত করুন।
- Bangla QR লোগো merchant-স্থানে প্রদর্শনের নিয়ম আছে; অনলাইন পেজে QR-এর সাথে কীভাবে দেখাতে হবে তা ব্যাংকের কাছ থেকে জেনে নিন।

**যা জানা নেই (ব্যাংকের কাছ থেকে নিতে হবে):** API endpoint, authentication, QR তৈরির response-এর আকার, notification (webhook/IPN) আছে কি না ও তার signature, status-query API, মেয়াদ, ফি, settlement সময়, sub-merchant (প্রতিষ্ঠানভিত্তিক) নিবন্ধনের সুযোগ, sandbox। এই ফাইলের কোনো URL/ফিল্ড-নাম বাস্তব API নয় — নিচের সবকিছু **স্থানধারক**।

---

## Part B — ব্যাংক/PSP-কে যে প্রশ্নগুলো করবেন (চেকলিস্ট)
| # | প্রশ্ন | কোন seam-এ প্রভাব |
|---|---|---|
| 1 | Dynamic QR তৈরির API আছে কি? Response-এ কী আসে — EMV payload স্ট্রিং, না ছবি, না hosted পেজের লিংক? | `create()` → `qr_payload` (স্ট্রিং না হলে নিচে "ছবি/লিংক হলে") |
| 2 | QR-এ আমাদের রেফারেন্স কোথায় যায়, ও সর্বোচ্চ কত অক্ষর? (আমাদের `gateway_ref` ২০ অক্ষর `[A-Z0-9]`) | `gateway_ref` দৈর্ঘ্য |
| 3 | পেমেন্ট হলে আমাদের কি জানানো হয় (webhook/IPN)? কোন URL-এ, কী signature/secret/IP? | `extractRef()`, `authenticate()`, `capabilities()['notify']` |
| 4 | Status জিজ্ঞাসার API আছে কি? রেফারেন্স দিয়ে? | `query()`, `capabilities()['query']` |
| 5 | QR-এর মেয়াদ কত? মেয়াদ শেষে পেমেন্ট করলে কী হয় — প্রত্যাখ্যাত, না গৃহীত? | `expires_at`, `review/late_payment` |
| 6 | গ্রাহক অন্য অঙ্ক দিতে পারে কি (dynamic QR-এ)? কম/বেশি হলে? | `review/amount_mismatch` |
| 7 | Settlement কত দিনে ও কোন অ্যাকাউন্টে? প্রতিষ্ঠানভেদে আলাদা অ্যাকাউন্টে সরাসরি settle সম্ভব? | institution mode vs platform mode |
| 8 | ফি (MDR) কত, কে বহন করে? | registry `fee_percent` |
| 9 | Sub-merchant: একটি আপনার অ্যাকাউন্টের অধীনে প্রতিষ্ঠানভিত্তিক আলাদা QR/ID সম্ভব, না প্রতিটি প্রতিষ্ঠান আলাদা নিবন্ধন? | `credential_fields` (প্রতিষ্ঠানের নিজের ID লাগবে কি) |
| 10 | Sandbox/UAT, test QR ও test অ্যাপ আছে কি? | `GatewayContractTest` fixtures |
| 11 | Refund/reversal API আছে কি? (এই release-এর বাইরে, কিন্তু জানা থাকা ভালো) | — |
| 12 | লোগো ও প্রদর্শনের নিয়ম | `QrPaymentPanel` |
| 13 | Reconciliation: দৈনিক settlement report ফাইল/API আছে কি? | settlement যাচাই |

উত্তরগুলো `docs/DECISIONS.md`-এ লিখে রাখুন; Part C শুরুর আগে অন্তত ১–৫ নিশ্চিত থাকতে হবে।

---

## Part C — ব্যাংকের API পেলে যা করতে হবে (প্রকল্পের পরে)

### C1. `BanglaQrGateway` adapter লিখুন
`app/Services/Payments/Gateways/BanglaQrGateway.php` — `GatewayInterface` implement। নিচের কাঠামো **স্থানধারক**; `TODO` চিহ্নিত অংশ ব্যাংকের ডকুমেন্টেশন থেকে পূরণ হবে।
```php
<?php
namespace App\\Services\\Payments\\Gateways;

use App\\Models\\OnlinePayment;
use App\\Services\\Payments\\GatewayInterface;
use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Http;

class BanglaQrGateway implements GatewayInterface
{
    public function capabilities(): array
    {
        return ['flow' => 'qr', 'notify' => true /* TODO: Q3 */, 'query' => true /* TODO: Q4 */];
    }

    public function create(OnlinePayment $p, array $creds, bool $sandbox): array
    {
        // TODO(Q1,Q2,Q5): call the bank's "create dynamic QR" API with
        //   amount            = $p->amount            (2 decimals, BDT)
        //   reference/bill no = $p->gateway_ref       (<= 20 chars, [A-Z0-9])
        //   merchant identity = $creds[...]           (whatever the bank issues - see credential_fields)
        $res = Http::withToken(/* TODO */)->post(/* TODO bank URL */, [/* TODO */])->throw()->json();

        return [
            'flow'               => 'qr',
            'qr_payload'         => $res['TODO_emv_string'],                 // the EMV string the app draws as a QR
            'expires_at'         => $res['TODO_expiry'] ?? now()->addMinutes(15)->toISOString(),
            'gateway_payment_id' => $res['TODO_order_id'] ?? null,
        ];
    }

    public function extractRef(Request $r): ?string { return $r->input('TODO_reference'); }             // Q3: where our ref comes back

    public function authenticate(Request $r, OnlinePayment $p, array $creds): bool
    {
        // TODO(Q3): verify the bank's signature / shared secret / source IP exactly as documented.
        // If the bank gives NO authentication, return true ONLY because finalize() re-checks with query()/confirm() - and then query must exist (Q4).
        return hash_equals(/* expected */ '', /* received */ '');
    }

    public function confirm(OnlinePayment $p, array $callback, array $creds, bool $sandbox): array
    {
        // Ask the bank for the truth for $p->gateway_ref; never trust $callback for amount or status.
        return $this->query($p, $creds, $sandbox);
    }

    public function query(OnlinePayment $p, array $creds, bool $sandbox): array
    {
        // TODO(Q4): map the bank's status to:
        //   paid     -> ['ok'=>true,  'trx_id'=>..., 'amount'=>(float)..., 'channel'=>'banglaqr', 'raw'=>$res]
        //   unpaid   -> ['ok'=>false, 'reason'=>'pending', 'raw'=>$res]
        //   rejected -> ['ok'=>false, 'reason'=>'<bank code>', 'raw'=>$res]
    }

    public function notifyResponse(OnlinePayment $p): \\Symfony\\Component\\HttpFoundation\\Response
    {
        return response('OK');                                              // TODO(Q3): the exact answer the bank expects
    }

    public function verifyCredentials(array $creds, bool $sandbox): array
    {
        // TODO: a call that proves the credentials work and moves NO money (e.g. token grant, or a merchant-info call)
    }
}
```
- `qr_payload` যদি **ছবি বা hosted লিংক** হয় (EMV স্ট্রিং নয়): ছবি হলে `qr_payload`-এ `data:image/png;base64,…` রাখুন এবং `QrPaymentPanel` `qr_payload` `data:` দিয়ে শুরু হলে `<img>` দেখায়; hosted লিংক হলে adapter `flow = 'redirect'` ফেরত দিক — তাহলে নতুন কিছুই লাগে না।
- Notification-এর কোনো signature না থাকলে `authenticate()` শুধু IP allow-list করতে পারে, কিন্তু তখন অবশ্যই `query()` থাকতে হবে (Q4) — notification কেবল "এখন জিজ্ঞাসা করো" সংকেত।

### C2. Registry entry যোগ করুন — `config/payments.php`
```php
'banglaqr' => [
    'label'   => ['bn' => 'বাংলা QR', 'en' => 'Bangla QR'],
    'class'   => \\App\\Services\\Payments\\Gateways\\BanglaQrGateway::class,
    'flow'    => 'qr',
    'sandbox_toggle' => true,
    'fee_percent'    => (float) env('GATEWAY_FEE_BANGLAQR', 0),             // TODO(Q8): the real figure
    'credential_fields' => [ /* TODO(Q9): e.g. merchant id, terminal id, api key, secret - mark secrets 'secret' => true */ ],
    'platform_credentials' => [ /* env('BANGLAQR_...') ... */ 'sandbox' => env('BANGLAQR_SANDBOX', true) ],
    'callback_urls' => ['notify' => '/api/v1/fees/payment/banglaqr/notify'],   // give THIS to the bank (central domain)
],
```
`.env`: `ENABLED_GATEWAYS=bkash,sslcommerz,banglaqr`, `GATEWAY_FEE_BANGLAQR=…`, `BANGLAQR_*`।

### C3. যা বদলাতে **হবে না** (যাচাই করুন)
| জায়গা | কেন বদলায় না |
|---|---|
| `online_payments`, `institution_payment_gateways`, `fee_payments` | `gateway`/`payment_method` VARCHAR; `qr_payload`, `expires_at`, `flow`, `channel` আগেই আছে |
| Routes | `POST /fees/payment/{gateway}/create`, `/fees/payment/{gateway}/notify` generic |
| `OnlinePaymentService` / `finalize` | `flow` দেখে চলে; `review` আগে থেকেই |
| Parent UI | `payment-options` `flow:'qr'` ফেরত দিলে `QrPaymentPanel` |
| Settings → Payments পাতা | `available_gateways[].credential_fields` থেকে ফর্ম |
| Settlement, liability, notifications | `collected_by` ও `net_amount` gateway-নিরপেক্ষ |

### C4. পরীক্ষা
1. `GatewayContractTest` এ `banglaqr` স্বয়ংক্রিয়ভাবে যুক্ত হয় (registry লুপ) — ব্যাংকের sandbox response থেকে `Http::fake` fixture বানান।
2. হাতে sandbox-এ: ছোট অঙ্কে (৳১০) dynamic QR → ব্যাংকের test অ্যাপে পেমেন্ট → রসিদ।
3. প্রান্তিক অবস্থা: (ক) মেয়াদ শেষের পর পেমেন্ট; (খ) ভিন্ন অঙ্ক (ব্যাংক অনুমোদন করলে); (গ) একই QR দুইবার; (ঘ) notification দেরিতে/দুইবার; (ঙ) notification না এলে `query` দিয়ে নিষ্পত্তি; (চ) পাতা reload। প্রতিটির প্রত্যাশা `QrFlowTest`/`ReviewFlowTest`-এর মতো।
4. Settlement: প্রথম দিনের লেনদেন ব্যাংকের settlement রিপোর্টের সাথে হাতে মেলান (Q13)।

### C5. চালু (rollout)
1. প্রথমে একটি প্রতিষ্ঠানে (`institution` mode, নিজের ব্যাংক-অ্যাকাউন্ট) pilot; Super Admin ড্যাশবোর্ডে `review` সংখ্যা চোখে রাখুন।
2. `settings.platform_collect` ও আইনি অনুমোদন সংক্রান্ত নিয়ম আগের মতোই (`PRODUCT.md` → Owner Actions)।
3. ঠিক থাকলে `ENABLED_GATEWAYS`-এ সবার জন্য চালু।
4. Rollback: `.env` থেকে `banglaqr` সরান — বিদ্যমান `initiated` row গুলো reconcile/notify দিয়ে শেষ হয়; ইতিহাস বহাল (disabled gateway-র credential ও row মুছে না)।

---

## Part D — যেকোনো নতুন gateway যোগ করার সাধারণ ধাপ (Nagad সরাসরি, অন্য ব্যাংক ইত্যাদি)
1. `GatewayInterface` implement করে `app/Services/Payments/Gateways/XxxGateway.php`।
2. `config/payments.php`-এ registry entry (label, class, flow, fee, `credential_fields`, `platform_credentials`, `callback_urls`)।
3. `.env`-এ `ENABLED_GATEWAYS`-এ key যোগ।
4. fixture সহ `GatewayContractTest` চালান (স্বয়ংক্রিয়ভাবে লুপে আসে)।
5. কোনো migration, route, controller, frontend বদল **লাগবে না**; লাগলে সেটি seam-এর ত্রুটি — `docs/DECISIONS.md`-এ লিখে জানান।

## Part E — এখন (প্রকল্পের ভেতরে) যা বানাতে হবে: সংক্ষিপ্ত তালিকা
`docs/BUILD-SEQUENCE.md` Step 5.2b-তে অন্তর্ভুক্ত:
- [ ] `config/payments.php` registry; `GatewayRegistry`; `PaymentRouter` registry-নির্ভর
- [ ] `GatewayInterface` (flow, `extractRef`, `authenticate`, `notifyResponse`) ও `BkashGateway`, `SslCommerzGateway` তার ভেতরে
- [ ] generic `POST|GET /fees/payment/{gateway}/notify` ও `FeePaymentCallbackController::notify`
- [ ] `create` route-এ gateway constraint registry থেকে (হার্ডকোড `bkash|sslcommerz` নয়)
- [ ] `gateway_ref` ২০ অক্ষর; `online_payments`-এ `flow/channel/qr_payload/expires_at`; status `review`
- [ ] `finalize()`-এ review/late-payment যুক্তি ও Super Admin resolve
- [ ] `FeeService::recordOnlinePayment` `payment_method = channel ?? gateway`; `platformModeFees` registry `fee_percent` থেকে
- [ ] React `PaymentFlow`, `QrPaymentPanel`; Settings ফর্ম `available_gateways` থেকে
- [ ] `FakeQrGateway` (শুধু non-production) ও `QrFlowTest`, `ReviewFlowTest`, `RegistryExtensibilityTest`, `NotifyEndpointTest`
