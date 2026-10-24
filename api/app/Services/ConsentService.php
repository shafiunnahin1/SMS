<?php

namespace App\Services;

use App\Models\{AuditLog, Consent, Student, User};

// docs/legal/privacy-and-consent.md section 3 "ConsentService" (spec code; every change is audited as consent.granted/revoked).
// Indicative, not blocking: a missing consent never stops an admission (settings.require_consent comes in Phase 8).
class ConsentService
{
    public const TYPES = ['data_processing', 'sms', 'health_data', 'photo'];

    public function record(Student $s, string $type, string $method, array $guardian = [], ?int $by = null): Consent
    {
        // D161 (owner 2026-10-24): staff may record a guardian's SMS consent (paper), but never over the guardian's own opt-out
        $own = Consent::where('student_id', $s->id)->where('type', $type)->where('status', 'revoked')->whereIn('method', ['portal', 'otp'])->exists();
        if ($type === 'sms' && $method === 'paper' && $own) throw new \App\Exceptions\BusinessException('the guardian switched SMS off', 'consent_guardian_revoked', 422);
        $consent = Consent::updateOrCreate(['student_id' => $s->id, 'type' => $type], [
            'status' => 'granted', 'method' => $method, 'recorded_by' => $by, 'granted_at' => now(), 'revoked_at' => null,
            'guardian_name' => $guardian['name'] ?? null, 'guardian_phone' => User::normalisePhone($guardian['phone'] ?? $s->guardian_phone),
        ]);
        AuditLog::record('consent.granted', $consent, ['type' => $type, 'method' => $method]);
        return $consent;
    }

    public function revoke(Student $s, string $type, string $method = 'portal'): Consent
    {
        $consent = Consent::updateOrCreate(['student_id' => $s->id, 'type' => $type], [
            'status' => 'revoked', 'method' => $method, 'revoked_at' => now(), 'guardian_phone' => User::normalisePhone($s->guardian_phone),
        ]);
        AuditLog::record('consent.revoked', $consent, ['type' => $type]);
        return $consent;
    }

    /** false if ANY student linked to this guardian phone revoked sms */
    public function allowsSms(string $phone): bool
    {
        return !Consent::where('guardian_phone', User::normalisePhone($phone) ?? $phone)->where('type', 'sms')->where('status', 'revoked')->exists();
    }

    public function hasDataConsent(Student $s): bool
    {
        return Consent::where('student_id', $s->id)->where('type', 'data_processing')->where('status', 'granted')->exists();
    }
}
