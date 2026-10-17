<?php

namespace App\Services;

use App\Exceptions\{BusinessException, SmsGatewayException};
use App\Models\{Institution, PlatformSetting, SmsCreditTransaction, SmsLog, User};
use App\Services\Sms\SmsGateway;
use App\Support\{Money, SmsSegments, Tenancy};
use Illuminate\Support\Facades\{Crypt, DB};
use Illuminate\Support\Str;

// docs/modules/notifications.md "SmsService" + D56 (owner, 2026-10-10): the institution's SMS wallet is money (taka). Every
// sent message costs its billable parts x the platform rate (SmsSegments::billable - 150 GSM / 70-67 Unicode chars), taken
// from the wallet with a ledger row; not enough money -> 402 and nothing is sent. No plan quota any more (D55).
// D59: the institution's own API (switched on, key + sender set) is used instead - never charged; when it fails and the
// universal switch is on, ONE fallback through the universal API (charged). Both switched off -> nothing is sent.
class SmsService
{
    public function __construct(private SmsGateway $gateway) {}

    /** D59: the institution's own BulkSMSBD API - only when switched on AND both its key and sender are set */
    public function ownRoute(Institution $i): ?array
    {
        if (!$i->sms_own_enabled || !$i->sms_api_key || !$i->sms_sender_id) return null;
        return ['sid' => $i->sms_sender_id, 'key' => $i->sms_api_key, 'own' => true];
    }

    /** D57: the universal API - the Super Admin's key/sender (key stored encrypted), else the server config */
    public function universalRoute(): array
    {
        $key = PlatformSetting::read('sms_universal_api_key');
        $sid = PlatformSetting::read('sms_universal_sender_id') ?: config('services.bulksmsbd.sender_id') ?: config('services.ssl_wireless.sid');
        return ['sid' => (string) $sid, 'key' => $key ? Crypt::decryptString($key) : null, 'own' => false];
    }

    /** Adds the institution suffix only when the platform sender is used */
    public function compose(string $message, array $sender, Institution $i): string
    {
        return $sender['own'] ? $message : $message . ' -' . (($i->settings ?? [])['sms_short_name'] ?? Str::limit($i->name, 30, ''));
    }

    /** D56: the platform's price of one billable SMS part, in taka (Super Admin's setting, else config) */
    public function rate(): string
    {
        return Money::format(Money::toPaisa((string) PlatformSetting::read('sms_rate', config('services.sms.rate', '0.40'))));
    }

    /** Paisa a text costs on the universal API */
    public function costOf(string $text): int
    {
        return SmsSegments::billable($text) * Money::toPaisa($this->rate());
    }

    public function canSend(Institution $i, string $text): bool
    {
        return Money::toPaisa((string) $i->fresh()->sms_balance) >= $this->costOf($text);
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
        $own = $this->ownRoute($i);
        $universal = (bool) $i->sms_universal_enabled;
        if (!$own && !$universal) throw new BusinessException('SMS is switched off for this institution', 'sms_disabled', 409);

        $fallback = false;
        $ok = false;
        if ($own) {
            // D59: the own API - no wallet, no charge, no suffix
            $sender = $own;
            $text = $this->compose($message, $sender, $i);
            $ok = $this->gateway->send($phone, $text, $sender['sid'], $sender['key']);
            // the own API failed: ONE try through the universal API, only if it is on and the wallet can pay for it
            if (!$ok && $universal && $this->canSend($i, $this->compose($message, $this->universalRoute(), $i))) {
                $fallback = true;
            }
        }
        if (!$own || $fallback) {
            $sender = $this->universalRoute();
            $text = $this->compose($message, $sender, $i);
            if (!$fallback && !$this->canSend($i, $text)) throw new BusinessException('SMS wallet balance too low', 'sms_quota_exceeded', 402);
            $ok = $this->gateway->send($phone, $text, $sender['sid'], $sender['key']);
        }

        if (!$ok && !$finalAttempt) throw new SmsGatewayException('sms gateway refused the message');

        $parts = SmsSegments::count($text);
        $charged = $ok && !$sender['own'];
        $cost = $charged ? $this->costOf($text) : 0;
        $log = SmsLog::create([
            'to_phone' => $phone, 'message' => $text, 'status' => $ok ? 'sent' : 'failed', 'sender_id' => $sender['sid'],
            'segments' => max(1, $parts['segments']), 'encoding' => $parts['encoding'], 'cost' => Money::format($cost),
            'route' => $sender['own'] ? 'own' : 'universal', 'fallback_used' => $fallback, 'error' => $ok ? null : 'gateway_error', 'sent_by' => $sentBy,
        ]);
        if ($charged) $this->charge($i, $log, SmsSegments::billable($text), $cost);
        return $ok;
    }

    /** D56: take the message's price from the wallet - the row is locked so two jobs never spend the same taka; one ledger row each */
    private function charge(Institution $i, SmsLog $log, int $parts, int $costPaisa): void
    {
        if ($costPaisa <= 0) return;
        DB::transaction(function () use ($i, $log, $parts, $costPaisa) {
            $locked = Institution::whereKey($i->id)->lockForUpdate()->first();
            $balance = max(0, Money::toPaisa((string) $locked->sms_balance) - $costPaisa);
            $locked->forceFill(['sms_balance' => Money::format($balance)])->save();
            SmsCreditTransaction::create(['type' => 'usage', 'quantity' => -$parts, 'amount' => Money::format(-$costPaisa),
                'balance_after' => Money::format($balance), 'reference' => "sms_log:{$log->id}"]);
        });
    }

    /** GET /subscription/sms-credits: the wallet, the rate and this month's sending */
    public function usage(Institution $i): array
    {
        $month = SmsLog::where('status', 'sent')->where('sent_at', '>=', now()->startOfMonth());
        return ['balance' => Money::format(Money::toPaisa((string) $i->fresh()->sms_balance)), 'rate' => $this->rate(),
            'sent_this_month' => (clone $month)->count(), 'spent_this_month' => Money::format(Money::toPaisa((string) ((clone $month)->sum('cost') ?: '0')))];
    }
}
