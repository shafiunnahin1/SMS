<?php

namespace App\Jobs;

use App\Exceptions\BusinessException;
use App\Models\User;
use App\Services\SmsService;
use App\Traits\TenantAwareJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

// D201 SUBM.2: the SMS of ONE cover notice. The intent lives in the in-app notification row itself (data.sms: pending -> sending
// -> sent | failed); the job first claims pending -> sending with one conditional update, so however often it is queued (a
// retry, the sweep, a replay) a notice is sent at most once. One attempt only: an unclear gateway answer is never retried.
class SendSubstitutionSmsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public int $tries = 1;

    public function __construct(public int $userId, public string $notificationId, int $institutionId)
    {
        $this->institutionId = $institutionId;
    }

    public function handle(SmsService $sms): void
    {
        $user = User::inTenant()->find($this->userId);
        if (!$user) return;
        $row = fn () => $user->notifications()->whereKey($this->notificationId);
        if ($row()->where('data->data->sms', 'pending')->update(['data->data->sms' => 'sending']) !== 1) return;   // someone else has it, or it is done
        $body = $row()->first()?->data['body'] ?? null;
        $ok = false;
        try {
            // not transactional: the consent, credit and sender rules of every ordinary SMS apply
            $ok = $user->phone && $body && $sms->send($user->phone, $body, null, false, true);
        } catch (BusinessException) {
            $ok = false;                                                       // SMS switched off or no credit: recorded as failed, never retried
        }
        $row()->update(['data->data->sms' => $ok ? 'sent' : 'failed']);
    }
}
