<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Institution, SmsCreditTransaction, SmsLog};
use App\Services\Sms\SmsGateway;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// docs/modules/notifications.md "SmsService" + docs/modules/coaching-private-batch.md "SMS Credits".
// Unicode segment counting and per-segment charging arrive with Step 3.7 (docs/I18N.md section 7); until then 1 message = 1 credit.
class SmsService
{
    public function __construct(private SmsGateway $gateway) {}

    /** ['sid' => string, 'own' => bool]: the institution's approved masking ID, else the platform sender */
    public function senderFor(Institution $i): array
    {
        if ($i->sms_sender_status === 'approved' && $i->sms_sender_id) return ['sid' => $i->sms_sender_id, 'own' => true];
        return ['sid' => (string) config('services.ssl_wireless.sid'), 'own' => false];
    }

    /** Adds the institution suffix only when the platform sender is used */
    public function compose(string $message, array $sender, Institution $i): string
    {
        return $sender['own'] ? $message : $message . ' -' . (($i->settings ?? [])['sms_short_name'] ?? Str::limit($i->name, 30, ''));
    }

    /** Monthly plan quota first, then prepaid credits (sms_balance); neither left -> sms_quota_exceeded */
    public function canSend(Institution $i): bool
    {
        return $this->quotaLeft($i) > 0 || $i->fresh()->sms_balance > 0;
    }

    public function send(string $phone, string $message, ?int $sentBy = null): bool
    {
        $i = Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException(SmsLog::class);
        if (!$this->canSend($i)) throw new BusinessException('SMS কোটা ও ক্রেডিট শেষ', 'sms_quota_exceeded', 402);

        $sender = $this->senderFor($i);
        $text = $this->compose($message, $sender, $i);
        $ok = $this->gateway->send($phone, $text, $sender['sid']);
        $fallback = false;

        // The institution's own ID failed: retry ONCE with the platform sender. Never flips the stored approval status.
        if (!$ok && $sender['own']) {
            $sender = ['sid' => (string) config('services.ssl_wireless.sid'), 'own' => false];
            $text = $this->compose($message, $sender, $i);
            $ok = $this->gateway->send($phone, $text, $sender['sid']);
            $fallback = true;
        }

        $log = SmsLog::create([
            'to_phone' => $phone, 'message' => $text, 'status' => $ok ? 'sent' : 'failed', 'sender_id' => $sender['sid'],
            'fallback_used' => $fallback, 'error' => $ok ? null : 'gateway_error', 'sent_by' => $sentBy,
        ]);
        if ($ok) $this->chargeOne($i, $log);
        return $ok;
    }

    /** A sent message uses the monthly quota while it lasts, then one prepaid credit (ledger row `usage`) */
    private function chargeOne(Institution $i, SmsLog $log): void
    {
        if ($this->sentThisMonth() <= $this->monthlyQuota($i)) return;   // counted after logging: this message was inside the quota

        DB::transaction(function () use ($i, $log) {
            $locked = Institution::whereKey($i->id)->lockForUpdate()->first();
            $balance = max(0, $locked->sms_balance - 1);
            $locked->forceFill(['sms_balance' => $balance])->save();
            SmsCreditTransaction::create(['type' => 'usage', 'quantity' => -1, 'balance_after' => $balance, 'reference' => "sms_log:{$log->id}"]);
        });
    }

    private function monthlyQuota(Institution $i): int
    {
        $max = (int) ($i->plan?->max_sms ?? 0);
        return $max === -1 ? PHP_INT_MAX : max(0, $max);
    }

    private function sentThisMonth(): int
    {
        return SmsLog::where('status', 'sent')->where('sent_at', '>=', now()->startOfMonth())->count();
    }

    private function quotaLeft(Institution $i): int
    {
        $quota = $this->monthlyQuota($i);
        return $quota === PHP_INT_MAX ? PHP_INT_MAX : $quota - $this->sentThisMonth();
    }
}
