<?php

namespace App\Services\Sms;

// One adapter per provider; SmsService never talks HTTP itself. $apiKey: whose account sends - the platform's universal key
// (D57) or the institution's own key (D59); null = the adapter's configured default.
interface SmsGateway
{
    /** true when the provider accepted the message */
    public function send(string $phone, string $text, string $senderId, ?string $apiKey = null): bool;
}
