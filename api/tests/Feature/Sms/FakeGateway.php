<?php

namespace Tests\Feature\Sms;

use App\Services\Sms\SmsGateway;

// Records every send; refuses the sender IDs in $refuse (a provider rejecting an unapproved / broken masking ID)
class FakeGateway implements SmsGateway
{
    public array $sent = [];

    public function __construct(public array $refuse = []) {}

    public function send(string $phone, string $text, string $senderId, ?string $apiKey = null): bool
    {
        $this->sent[] = compact('phone', 'text', 'senderId', 'apiKey');
        return !in_array($senderId, $this->refuse, true) && !in_array('*', $this->refuse, true);
    }
}
