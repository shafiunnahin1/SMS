<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Log;

// Development / testing driver (G17): nothing leaves the server. The phone is masked; the text is shown so a developer can read OTPs.
class LogSmsGateway implements SmsGateway
{
    public function send(string $phone, string $text, string $senderId): bool
    {
        Log::info('[dev sms] to ' . substr($phone, 0, 3) . '******' . substr($phone, -2) . " from {$senderId}: {$text}");
        return true;
    }
}
