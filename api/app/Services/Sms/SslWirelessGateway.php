<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Http;

// TODO(OD-sms-gateway): request shape from docs/modules/notifications.md; confirm the success field, Unicode handling and
// delivery reports against SSL Wireless's current API documentation before production use.
class SslWirelessGateway implements SmsGateway
{
    public function send(string $phone, string $text, string $senderId, ?string $apiKey = null): bool
    {
        $r = Http::timeout(15)->post('https://sms.sslwireless.com/api/v3/send-sms', [
            'api_token' => $apiKey ?? config('services.ssl_wireless.token'),
            'sid'       => $senderId,
            'msisdn'    => '88' . $phone,                 // stored as 01XXXXXXXXX; the gateway wants the country code
            'sms'       => $text,
            'csmsid'    => uniqid(),
        ]);
        return $r->ok();
    }
}
