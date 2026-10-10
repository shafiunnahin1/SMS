<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

// D57/D59: BulkSMSBD. The request is the owner's sample (2026-10-10): POST api_key, senderid, number, message to
// services.bulksmsbd.url. TLS verification stays ON (the sample turned it off). Success: the JSON `response_code` is one of
// services.bulksmsbd.success_codes - TODO(OD-bulksmsbd-codes): confirm the list against BulkSMSBD's own response-code table.
class BulkSmsBdGateway implements SmsGateway
{
    public function send(string $phone, string $text, string $senderId, ?string $apiKey = null): bool
    {
        $key = $apiKey ?? (string) config('services.bulksmsbd.api_key');
        if ($key === '' || $senderId === '') return false;
        try {
            $r = Http::asForm()->timeout(15)->post((string) config('services.bulksmsbd.url'), [
                'api_key' => $key, 'senderid' => $senderId, 'number' => '88' . (\App\Models\User::normalisePhone($phone) ?? $phone), 'message' => $text,
            ]);
        } catch (\Throwable $e) {
            Log::warning('bulksmsbd unreachable', ['error' => class_basename($e)]);          // no phone, no text (G9)
            return false;
        }
        $code = $r->json('response_code');
        $ok = $r->successful() && in_array((int) $code, (array) config('services.bulksmsbd.success_codes'), true);
        if (!$ok) Log::warning('bulksmsbd refused', ['http' => $r->status(), 'code' => $code]);
        return $ok;
    }
}
