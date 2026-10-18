# Payment Gateway Integration

> **Revision 6.2 — দুই ধরনের পেমেন্ট, আলাদা code path:**
> 1. **Subscription** (প্রতিষ্ঠান → প্ল্যাটফর্ম): এই ফাইল, SSLCommerz, **প্ল্যাটফর্মের নিজস্ব credential** (`.env`)।
> 2. **ফি** (অভিভাবক → প্রতিষ্ঠান): `docs/modules/online-fee-payment.md` — প্রতিষ্ঠানের নিজস্ব merchant credential থাকলে সরাসরি তাদের অ্যাকাউন্টে, নইলে প্ল্যাটফর্ম সংগ্রহ করে settle করে। এই ফাইলের `BkashService`/SSLCommerz কোড ফি-র জন্য **সরাসরি ব্যবহার করবেন না**: সেগুলো `config()` থেকে credential পড়ে; ফি-র জন্য একই logic `GatewayInterface`-এর ভেতরে, credential method argument হিসেবে। নিচের "Gateway Summary"-র "Parent → Institution" সারি দুটি ওই ফাইল অনুযায়ী পড়ুন।
> 3. Nagad-এর সরাসরি integration-এর কোনো code এই plan-এ নেই; release 1-এ বানাবেন না (SSLCommerz-এর ভেতর দিয়ে Nagad পাওয়া যায়)।
> 4. **Bangla QR পরে** — ব্যাংকের API পেলে। কাঠামো এখনই প্রস্তুত (registry, flow-aware interface, generic notify): `docs/modules/banglaqr-readiness.md`।

## Gateway Summary
| Gateway | Use Case | Charge | Users |
|---------|---------|-------|------------|
| bKash | Parent → Institution ফি পেমেন্ট | ~১.৫% | ৭ কোটি+ |
| Nagad | Parent → Institution ফি (বিকল্প) | ~১% | ৩ কোটি+ |
| SSLCommerz | Institution → SaaS Subscription (প্ল্যাটফর্ম credential); ফি-র জন্যও (প্রতিষ্ঠান/প্ল্যাটফর্ম credential, `online-fee-payment.md`) | ~২% | সব মেথড (bKash, Nagad, কার্ড, নেট ব্যাংকিং) |

## bKash Merchant API Integration

### Flow
```
Parent → "bKash দিয়ে পে করুন"
  → POST /api/v1/fees/payment/bkash/create
      { student_id, dues: ["12:3:2026-10", ...] }     // Revision 6.2: due keys only, the server computes the amount
  → BkashService::getToken() [Cache 3500s]
  → bKash API: /tokenized/checkout/create
      { amount, currency:'BDT', callbackURL, merchantInvoiceNumber }
  → Response: { paymentID, bkashURL }
  → React: window.location.href = bkashURL

Parent bKash পেজে → PIN দেয়

bKash → GET /api/fees/payment/bkash/callback
        ?paymentID=xxx&status=success
  → BkashService::executePayment(paymentID)
  → BkashService::queryPayment(paymentID) [verify]
  → FeePayment record তৈরি, receipt_no generate
  → SMS পাঠানো অভিভাবককে
  → React /parent/fees?success=1 → Toast + রসিদ বাটন
```

### BkashService.php
```php
class BkashService {
    private string $baseUrl = 'https://tokenized.pay.bka.sh/v1.2.0-beta';

    private function getToken(): string {
        return Cache::remember('bkash_token', 3500, fn() =>
            Http::withHeaders(['username' => config('services.bkash.username'),
                               'password' => config('services.bkash.password')])
                ->post("{$this->baseUrl}/tokenized/checkout/token/grant", [
                    'app_key'    => config('services.bkash.app_key'),
                    'app_secret' => config('services.bkash.app_secret'),
                ])->json('id_token')
        );
    }

    public function createPayment(float $amount, string $invoiceNo): array {
        return Http::withHeaders(['Authorization' => $this->getToken(),
                                  'X-APP-Key' => config('services.bkash.app_key')])
            ->post("{$this->baseUrl}/tokenized/checkout/create", [
                'amount'                => number_format($amount, 2, '.', ''),
                'currency'              => 'BDT',
                'intent'                => 'sale',
                'merchantInvoiceNumber' => $invoiceNo,
                'callbackURL'           => route('fee.bkash.callback') . '?ref=' . $ref,   // central domain; see online-fee-payment.md
            ])->json();
    }

    public function executePayment(string $paymentID): array {
        return Http::withHeaders(['Authorization' => $this->getToken(),
                                  'X-APP-Key' => config('services.bkash.app_key')])
            ->post("{$this->baseUrl}/tokenized/checkout/execute", [
                'paymentID' => $paymentID,
            ])->json();
    }
}
```

### .env config
```
BKASH_APP_KEY=your_app_key
BKASH_APP_SECRET=your_app_secret
BKASH_USERNAME=your_username
BKASH_PASSWORD=your_password
BKASH_SANDBOX=true  # false in production
```

## Nagad Integration
```php
// Nagad similar to bKash but different API structure
// Package: shurjomukhi/shurjopay or manual HTTP
// Merchant API: https://apis.mynagad.com/

// Key difference: Nagad uses RSA encryption for security
// public_key + private_key required from Nagad merchant portal
```

## SSLCommerz Integration (SaaS Subscription)

### Flow
```
Institution Admin → Subscription পেজ → প্ল্যান সিলেক্ট
  → POST /api/billing/initiate { plan_id, billing_cycle }
      → SSLCommerz session তৈরি
      → GatewayPageURL পাওয়া
  → React: window.location.href = GatewayPageURL

Gateway → Card/bKash/Nagad/NetBanking পেমেন্ট

SSLCommerz → POST /api/billing/ssl/success (form data)
  → $sslc->orderValidate(request()->all(), $tranId, $amount, 'BDT')
  → Institution subscription_expires_at আপডেট
  → Invoice PDF তৈরি
  → Email পাঠানো
```

### Laravel Code
```php
// composer require sslcommerz/ssl-commerz-laravel

public function initiate(Request $request) {
    $plan = SubscriptionPlan::findOrFail($request->plan_id);
    $institution = app('currentInstitution');

    $post_data = [
        'total_amount'  => $plan->price,
        'currency'      => 'BDT',
        'tran_id'       => 'SUB-' . uniqid(),
        'product_name'  => "Edu SaaS - {$plan->name} Plan",
        'product_category' => 'Software Subscription',
        'cus_name'      => $institution->name,
        'cus_email'     => $institution->email,
        'cus_phone'     => $institution->phone,
        'success_url'   => route('ssl.success'),
        'fail_url'      => route('ssl.fail'),
        'cancel_url'    => route('ssl.cancel'),
        'ipn_url'       => route('ssl.ipn'),  // instant payment notification
    ];

    $sslc = new SslCommerzNotification();
    $payment_options = $sslc->makePayment($post_data, 'checkout', 'json');
    return response()->json(['payment_url' => $payment_options['GatewayPageURL']]);
}

public function success(Request $request) {
    $sslc = new SslCommerzNotification();
    if ($sslc->orderValidate($request->all(), $request->tran_id, $request->amount, 'BDT')) {
        // Update subscription
        $institution->update(['subscription_expires_at' => now()->addDays($plan->duration_days)]);
        // Generate invoice + send email
    }
}
```

## React Payment UI (Revision 6.2)
```jsx
// pages/parent/FeePayment.jsx
// 1. GET /parent/fees            -> due lines per child: [{ key: "12:3:2026-10", category, period, amount }, ...]
// 2. GET /parent/fees/payment-options -> [{ gateway: 'bkash', mode: 'institution' }, ...]   (empty => hide the Pay button)
const handlePay = async () => {
  setLoading(true)
  try {
    const res = await api.post(`/fees/payment/${gateway}/create`, { student_id, dues: selectedKeys })   // keys only; NEVER an amount
    window.location.href = res.data.payment_url                                                         // gateway page
  } catch (err) { addToast(err.response?.data?.message ?? 'পেমেন্ট শুরু করতে সমস্যা হয়েছে', 'error'); setLoading(false) }
}
// Return page (/parent/fees?success=1&ref=FEE-…): poll GET /parent/online-payments/{ref} every 3 s for up to 30 s,
// because the server-to-server confirmation can arrive a moment after the browser. Then show the receipt button.
const params = new URLSearchParams(location.search)
if (params.get('failed')) addToast('পেমেন্ট ব্যর্থ হয়েছে', 'error')
```
Full UI notes (mode disclosure text, institution settings pages): `docs/modules/online-fee-payment.md` → "UI"।

## Payment Status Table
```sql
-- fee_payments.status
paid     → সফলভাবে পেমেন্ট হয়েছে
partial  → আংশিক পেমেন্ট
waived   → মওকুফ করা হয়েছে

-- fee_payments.payment_method
cash   → সরাসরি হাতে
bkash  → bKash mobile banking
nagad  → Nagad mobile banking
card   → ক্রেডিট/ডেবিট কার্ড
```
