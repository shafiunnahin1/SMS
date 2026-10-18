<?php

namespace App\Services\Auth;

/** D90: fail closed until a reviewed, secret-redacting transport is installed.
 * Never delegate to OtpService::sms or a log mailer. Tests replace this boundary in memory.
 */
class ActivationDelivery
{
    public function available(): bool { return false; }
    /** Recipient delivery must include the replacement tracking context as well as the code. */
    public function deliver(string $channel, string $contact, string $code, array $tracking): bool
    {
        return $this->send($channel, $contact, $code);
    }
    public function send(string $channel, string $contact, string $code): bool
    {
        return false;
    }
}
