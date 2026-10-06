<?php

namespace App\Services\Sms;

// One adapter per provider; SmsService never talks HTTP itself (AGENT-PLAN-R1 rule 5: adapter + fake until the provider is confirmed)
interface SmsGateway
{
    /** true when the provider accepted the message */
    public function send(string $phone, string $text, string $senderId): bool;
}
