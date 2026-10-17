<?php

namespace App\Services\Privacy;

use App\Models\{AuditLog, Institution, SmsLog};
use App\Support\Tenancy;

// docs/legal/privacy-and-consent.md section 4 "Retention": SMS log 180 days (the message text emptied after 90), audit log
// 2 years. Runs per institution inside Tenancy::as() - every institution, whatever its status (a suspended one keeps
// ageing) - plus the platform's own audit rows (no institution). Returns counts only.
class RetentionService
{
    public const SMS_TEXT_DAYS = 90;
    public const SMS_KEEP_DAYS = 180;
    public const AUDIT_KEEP_YEARS = 2;

    /** sms:trim (daily) */
    public function trimSms(): array
    {
        $out = ['emptied' => 0, 'deleted' => 0];
        foreach (Institution::query()->cursor() as $i) {
            Tenancy::as($i, function () use (&$out) {
                $out['deleted'] += SmsLog::where('sent_at', '<', now()->subDays(self::SMS_KEEP_DAYS))->delete();
                // schema.sql keeps message NOT NULL: the text is emptied, not NULLed (DECISIONS 2026-10-10 8.1)
                $out['emptied'] += SmsLog::where('sent_at', '<', now()->subDays(self::SMS_TEXT_DAYS))->where('message', '!=', '')->update(['message' => '']);
            });
        }
        return $out;
    }

    /** audit:trim (weekly) */
    public function trimAudit(): int
    {
        $cut = now()->subYears(self::AUDIT_KEEP_YEARS);
        $n = 0;
        foreach (Institution::query()->cursor() as $i) {
            $n += Tenancy::as($i, fn () => AuditLog::where('created_at', '<', $cut)->delete());
        }
        return $n + AuditLog::anyInstitution()->whereNull('institution_id')->where('created_at', '<', $cut)->delete();
    }
}
