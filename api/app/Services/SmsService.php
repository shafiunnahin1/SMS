<?php

namespace App\Services;

use App\Exceptions\{BusinessException, SmsGatewayException};
use App\Models\{Institution, SmsCreditTransaction, SmsLog, User};
use App\Services\Sms\SmsGateway;
use App\Support\{SmsSegments, Tenancy};
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// docs/modules/notifications.md "SmsService" + docs/modules/coaching-private-batch.md "SMS Credits".
// Quota and credit are counted in SMS PARTS (docs/I18N.md section 7, SmsSegments): a Bengali text over 70 units costs 2 or more.
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

    /** Monthly plan quota first, then prepaid credits (sms_balance); not enough for all the parts -> sms_quota_exceeded */
    public function canSend(Institution $i, int $segments = 1): bool
    {
        $quota = $this->quotaLeft($i);
        return $quota === PHP_INT_MAX || max(0, $quota) + $i->fresh()->sms_balance >= $segments;
    }

    /** docs/I18N.md section 7: the recipient's language - the parent user's own choice, else the institution's SMS language */
    public function localeFor(?User $recipient, Institution $i): string
    {
        $lang = app(InstitutionSettings::class)->language($i);
        return in_array($recipient?->locale, $lang['enabled'], true) ? $recipient->locale : $lang['sms_locale'];
    }

    /** $transactional: receipts, OTP, password reset - sent whatever the consent (privacy-and-consent.md section 3); every other
     *  message (absence alert, reminder, notice) is skipped for a phone whose guardian switched SMS off. Returns false when skipped.
     *  $finalAttempt = false (a queued job with retries left): a gateway failure throws SmsGatewayException so the queue retries;
     *  only the last attempt writes the failed row. */
    public function send(string $phone, string $message, ?int $sentBy = null, bool $transactional = false, bool $finalAttempt = true): bool
    {
        $i = Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException(SmsLog::class);
        if (!$transactional && !app(ConsentService::class)->allowsSms(User::normalisePhone($phone) ?? $phone)) return false;
        $sender = $this->senderFor($i);
        $text = $this->compose($message, $sender, $i);
        if (!$this->canSend($i, SmsSegments::count($text)['segments'])) throw new BusinessException('SMS quota and credit used up', 'sms_quota_exceeded', 402);

        $ok = $this->gateway->send($phone, $text, $sender['sid']);
        $fallback = false;

        // The institution's own ID failed: retry ONCE with the platform sender. Never flips the stored approval status.
        if (!$ok && $sender['own']) {
            $sender = ['sid' => (string) config('services.ssl_wireless.sid'), 'own' => false];
            $text = $this->compose($message, $sender, $i);
            $ok = $this->gateway->send($phone, $text, $sender['sid']);
            $fallback = true;
        }

        if (!$ok && !$finalAttempt) throw new SmsGatewayException('sms gateway refused the message');

        $parts = SmsSegments::count($text);
        $log = SmsLog::create([
            'to_phone' => $phone, 'message' => $text, 'status' => $ok ? 'sent' : 'failed', 'sender_id' => $sender['sid'],
            'segments' => max(1, $parts['segments']), 'encoding' => $parts['encoding'],
            'fallback_used' => $fallback, 'error' => $ok ? null : 'gateway_error', 'sent_by' => $sentBy,
        ]);
        if ($ok) $this->charge($i, $log);
        return $ok;
    }

    /** A sent message's parts use the monthly quota while it lasts; the parts beyond it take prepaid credits (ledger row `usage`) */
    private function charge(Institution $i, SmsLog $log): void
    {
        // counted after logging: the parts of this message that do not fit in the quota
        $over = min($log->segments, $this->sentThisMonth() - $this->monthlyQuota($i));
        if ($over <= 0) return;

        DB::transaction(function () use ($i, $log, $over) {
            $locked = Institution::whereKey($i->id)->lockForUpdate()->first();
            $balance = max(0, $locked->sms_balance - $over);
            $locked->forceFill(['sms_balance' => $balance])->save();
            SmsCreditTransaction::create(['type' => 'usage', 'quantity' => -$over, 'balance_after' => $balance, 'reference' => "sms_log:{$log->id}"]);
        });
    }

    /** GET /subscription/sms-credits: prepaid balance + this month's use (in SMS parts) */
    public function usage(Institution $i): array
    {
        $quota = $this->monthlyQuota($i);
        return ['balance' => (int) $i->fresh()->sms_balance, 'used_this_month' => $this->sentThisMonth(),
            'monthly_quota' => $quota === PHP_INT_MAX ? null : $quota, 'quota_left' => $quota === PHP_INT_MAX ? null : max(0, $quota - $this->sentThisMonth())];
    }

    private function monthlyQuota(Institution $i): int
    {
        $max = (int) ($i->plan?->max_sms ?? 0);
        return $max === -1 ? PHP_INT_MAX : max(0, $max);
    }

    private function sentThisMonth(): int
    {
        return (int) SmsLog::where('status', 'sent')->where('sent_at', '>=', now()->startOfMonth())->sum('segments');
    }

    private function quotaLeft(Institution $i): int
    {
        $quota = $this->monthlyQuota($i);
        return $quota === PHP_INT_MAX ? PHP_INT_MAX : $quota - $this->sentThisMonth();
    }
}
