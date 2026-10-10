<?php

namespace App\Jobs;

use App\Exceptions\BusinessException;
use App\Services\SmsService;
use App\Traits\TenantAwareJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;

// Carries one message; SmsService decides sender, suffix, quota and credit. Runs inside its institution (TenantAwareJob).
class SendSmsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public int $tries = 3;
    public array $backoff = [30, 120];          // seconds before the 2nd and 3rd attempt when the gateway refused

    public function __construct(public string $phone, public string $message, int $institutionId, public ?int $sentBy = null, public bool $transactional = false)
    {
        $this->institutionId = $institutionId;
    }

    public function handle(SmsService $sms): void
    {
        try {
            // a gateway failure with attempts left throws SmsGatewayException -> the queue retries after $backoff
            $sms->send($this->phone, $this->message, $this->sentBy, $this->transactional, finalAttempt: $this->attempts() >= $this->tries);
        } catch (BusinessException $e) {
            // An automatic message (receipt, absence alert) must never fail the work that triggered it, and retrying
            // cannot create credit. Direct sends from the UI still get the 402 from SmsService.
            if ($e->errorCode !== 'sms_quota_exceeded') throw $e;
            Log::warning('sms skipped: no quota or credit left', ['institution_id' => $this->institutionId]);
        }
    }
}
