# Notification System

## 3 Channel Types
1. SMS (SSL Wireless) — ইন্টারনেট ছাড়াও কাজ করে
2. Push (Firebase FCM) — Mobile app
3. In-App (DB + Polling) — Web ও App

## Trigger Matrix
| Event | SMS | Push | In-App |
|------|-----|------|--------|
| ছাত্র অনুপস্থিত | ✅ | ✅ | ✅ |
| ফি পরিশোধ | ✅ | ✅ | ✅ |
| বকেয়া রিমাইন্ডার | ✅ | ✅ | ❌ |
| রেজাল্ট পাবলিশ | ✅ | ✅ | ✅ |
| নতুন নোটিশ | ❌ | ✅ | ✅ |
| ভর্তি নিশ্চিতকরণ | ✅ | ✅ | ✅ |

## SMS Templates
```php
'absent'   => ':name আজ অনুপস্থিত। -:institution',
'fee_paid' => ':name এর :amount টাকা পরিশোধিত। রসিদ: :no',
'result'   => ':name এর :exam ফলাফল প্রকাশিত। GPA: :gpa',
'admit'    => 'ভর্তি সম্পন্ন। ID: :id পাসওয়ার্ড: :pass',
```

## Queue (Background SMS)
```php
// Dispatch bulk SMS to Queue
SendSmsJob::dispatch($phone, $message, app('currentInstitution')->id);
// php artisan queue:work (Supervisor) - the job binds its own tenant (TenantAwareJob)
```

## In-App Notification
```php
$parent->notify(new AbsentAlert($student));
// GET /api/notifications — React polls every 30 seconds
```

## SSL Wireless Integration & Sender ID (Revision 6.2)

### Rule (OD-2, চূড়ান্ত)
- যে প্রতিষ্ঠান নিজের **Sender/Masking ID** সেট করে এবং সেটি `approved` হয়, তার SMS ওই ID থেকে যায়।
- না করলে, বা `pending`/`rejected` থাকলে, SMS প্ল্যাটফর্মের default ID (`SMS_DEFAULT_SENDER`) থেকে যায় এবং message-এর শেষে `-{প্রতিষ্ঠানের সংক্ষিপ্ত নাম}` যোগ হয় (নিজস্ব ID-তে এটি যোগ হয় না — sender নামেই প্রতিষ্ঠান চেনা যায়)।
- Masking ID প্ল্যাটফর্মের SMS gateway account-এর অধীনে নিবন্ধিত হতে হয় (gateway/অপারেটরের নিয়মে, কয়েক দিন লাগতে পারে)। তাই `approved` করেন Super Admin, নিবন্ধন নিশ্চিত হওয়ার পর। কোনো স্বয়ংক্রিয় যাচাই ধরে নেওয়া হয়নি।

### Status Flow (`institutions.sms_sender_status`)
```
none ──(Admin submits an ID)──▶ pending ──(Super Admin registers it with the gateway, then approves)──▶ approved
                                   └──────────(Super Admin rejects + reason in sms_sender_note)──────▶ rejected
approved/rejected ──(Admin changes the ID)──▶ pending      (the old approved ID is NOT used while the new one is pending)
Admin clears the ID ──▶ none
```
- Validation: `^[A-Za-z0-9]{3,11}$` (max দৈর্ঘ্য `SMS_SENDER_MAX_LEN`, default 11) — gateway ভিন্ন সীমা দিলে `.env`-এ বদলান। শূন্যস্থান/চিহ্ন নয়। Reserved: প্ল্যাটফর্মের default ID ও `reserved_slugs` তালিকার নাম নেওয়া যাবে না। একই ID দুটি প্রতিষ্ঠানে `approved` থাকতে পারবে না (Super Admin approve-এর সময় চেক)।
- একটি প্রতিষ্ঠানের জন্য একটিই ID।

### API
```
GET  /admin/settings/sms-sender                         → { sender_id, status, note, default_sender, effective_sender }
PUT  /admin/settings/sms-sender         { sender_id }   → status = pending; Super Admin-কে in-app notification
DELETE /admin/settings/sms-sender                       → none
GET  /super/sms-senders?status=pending                  → approval queue
POST /super/institutions/{id}/sms-sender/approve
POST /super/institutions/{id}/sms-sender/reject  { reason }
```
Institution Admin UI: `/admin/settings/sms` — ID ইনপুট, status badge, "এখন কোন ID থেকে SMS যাচ্ছে" (effective sender), pending হলে "অনুমোদনের অপেক্ষায়; ততদিন {default} থেকে যাবে"। Plan gating নেই (সব plan)।

### Services/SmsService.php — Full Code
```php
<?php
namespace App\Services;

use App\Models\{Institution, SmsLog};
use Illuminate\Support\Facades\Http;

class SmsService
{
    /** ['sid' => string, 'own' => bool] */
    public function senderFor(Institution $i): array
    {
        if ($i->sms_sender_status === 'approved' && $i->sms_sender_id) {
            return ['sid' => $i->sms_sender_id, 'own' => true];
        }
        return ['sid' => config('services.ssl_wireless.sid'), 'own' => false];
    }

    /** Adds the institution suffix only when the platform sender is used */
    public function compose(string $message, array $sender, Institution $i): string
    {
        return $sender['own'] ? $message : $message . ' -' . ($i->settings['sms_short_name'] ?? \Str::limit($i->name, 30, ''));
    }

    public function send(string $phone, string $message, ?int $sentBy = null): bool
    {
        $i      = app('currentInstitution');
        $sender = $this->senderFor($i);
        $text   = $this->compose($message, $sender, $i);

        $ok = $this->post($phone, $text, $sender['sid']);
        $fallback = false; $error = null;

        // The institution's own ID failed (not registered yet / blocked): retry ONCE with the platform sender so the message is not lost.
        // Never flips the stored status automatically — a transient failure must not "reject" an approved ID.
        if (!$ok && $sender['own']) {
            $default  = ['sid' => config('services.ssl_wireless.sid'), 'own' => false];
            $ok       = $this->post($phone, $this->compose($message, $default, $i), $default['sid']);
            $fallback = true;
            $sender   = $default;
        }
        if (!$ok) $error = 'gateway_error';

        SmsLog::create([
            'to_phone' => $phone, 'message' => $text, 'status' => $ok ? 'sent' : 'failed',
            'sender_id' => $sender['sid'], 'fallback_used' => $fallback, 'error' => $error, 'sent_by' => $sentBy,
        ]);
        $this->chargeOne($i);        // quota / prepaid credit — docs/modules/coaching-private-batch.md "SMS Credits"
        return $ok;
    }

    private function post(string $phone, string $text, string $sid): bool
    {
        $r = Http::timeout(15)->post('https://sms.sslwireless.com/api/v3/send-sms', [
            'api_token' => config('services.ssl_wireless.token'),
            'sid'       => $sid,                          // the sender / masking ID
            'msisdn'    => $phone,
            'sms'       => $text,
            'csmsid'    => uniqid(),
        ]);
        return $r->ok();                                  // confirm the exact success field against the gateway's current API docs
    }

    public function sendAbsentAlert(Student $student): void
    {
        $this->send($student->guardian_phone,
            "প্রিয় অভিভাবক, আপনার সন্তান {$student->user->name} আজ " . now()->format('d/m/Y') . " অনুপস্থিত।");
    }

    public function sendBulk(array $phones, string $message): void
    {
        foreach ($phones as $phone) SendSmsJob::dispatch($phone, $message, app('currentInstitution')->id);
    }
}
```
- **Revision 9 — ভাষা ও খরচ (`docs/I18N.md` §৭):** বাংলা ও আরবি SMS Unicode (একক ৭০ অক্ষর, জোড়ায় ৬৭ প্রতি অংশ; GSM-7 ১৬০/১৫৩)। `SmsService` বার্তা গঠনের পর `SmsSegments::count()` দিয়ে অংশ গোনে এবং **অংশ অনুযায়ী** quota/credit কাটে (`sms_logs.segments`, `encoding`); আগের "প্রতি SMS ১" ভুল। প্রাপকের ভাষায় template (`lang/*/sms.php`)। **প্ল্যাটফর্ম-sender-এর নাম-suffix মাপা ফলে বাংলা/আরবিতে এক-লাইনের হাজিরা SMS ১ থেকে ২ অংশ করে দেয়** (ইংরেজি ১-ই) — তাই নিজস্ব approved sender ID (suffix নেই) এই ভাষাগুলোতে সরাসরি সাশ্রয়। Gateway-র unicode ফ্ল্যাগ আমি যাচাই করিনি: `TODO(OD-sms-unicode)`।
- **Message-এ আর `-{institution}` হাতে লেখা যাবে না** — সব SMS template থেকে নামের suffix সরিয়ে `compose()`-এ এক জায়গায় রাখা হয়েছে। (পুরনো উদাহরণে `-{$institution}` দেখলে বাদ দিন।)
- `SendSmsJob` constructor-এ `institutionId` নেয় এবং `handle()`-এর শুরুতেই `currentInstitution` bind করে (queue-তে request নেই)।
- Student-এর নাম `students` নয়, `users.name` থেকে (`$student->user->name`)।
- **Monitoring:** Super Admin Dashboard-এ "Sender ID সমস্যা" কার্ড — গত ২৪ ঘণ্টায় যেসব প্রতিষ্ঠানের `fallback_used` অনুপাত ২০% এর বেশি; Super Admin দেখে ID ঠিক আছে কি না যাচাই করে ম্যানুয়ালি `rejected` করতে পারে।
- Quota/credit গণনা আগের মতোই (প্রতি SMS ১টি), sender যা-ই হোক।

## Firebase FCM Push Notification
```php
// Services/PushNotificationService.php
public function send(string $fcmToken, string $title, string $body, array $data=[]): void {
    Http::withToken(config('services.fcm.server_key'))
        ->post('https://fcm.googleapis.com/fcm/send', [
            'to' => $fcmToken,
            'notification' => ['title' => $title, 'body' => $body],
            'data' => $data,
        ]);
}
```

## In-App Notification API
```
GET  /api/notifications           → unread list (React polling 30s)
PATCH /api/notifications/{id}/read → mark as read
PATCH /api/notifications/read-all  → mark all as read
```

## React Notification Bell
```jsx
const {data} = useQuery({
  queryKey: ['notifications'],
  queryFn: getNotifications,
  refetchInterval: 30000,  // ৩০ সেকেন্ডে রিফ্রেশ
})
// Bell icon + unread count badge in Header
// Notification list in dropdown
```

## Scheduled Reminders
```php
// 1st of every month — due fee SMS
// Daily 8AM — subscription expiry warning
// 3 days before exam — reminder
```
