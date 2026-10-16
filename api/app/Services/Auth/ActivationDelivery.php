<?php

namespace App\Services\Auth;

/** D90: fail closed until a reviewed, secret-redacting transport is installed.
 * Never delegate to OtpService::sms or a log mailer. Tests replace this boundary in memory.
 */
class ActivationDelivery
{
    public function send(string $channel, string $contact, string $code): bool
    {
        return false;
    }
}
