<?php

namespace App\Services\Sms;

use App\Jobs\SendSmsJob;
use App\Models\{Institution, SmsLog};
use App\Support\Tenancy;

// D208 SMSC.1: every event SMS goes through here. Per institution and event the admin chooses `off` (nothing is created), `auto`
// (queued and sent at once, as before) or `manual` (an sms_logs row waits as `pending` until someone sends or discards it).
// Defaults keep the behaviour before D208: `auto` where an SMS was sent, `off` for the admission result (new).
class SmsEventPolicy
{
    public const MODES = ['off', 'auto', 'manual'];
    public const EVENTS = [
        'attendance_absent' => 'auto', 'fee_paid' => 'auto', 'fee_due_reminder' => 'auto', 'result_published' => 'auto',
        'student_leave' => 'auto', 'staff_leave' => 'auto', 'salary' => 'auto', 'fee_refund' => 'auto', 'substitution' => 'auto',
        'admission_new_lead' => 'auto', 'admission_result' => 'off',
        'homework_new' => 'auto',   // D212 HW.1
        'holiday_new' => 'off',     // D213 CAL.1
        'risk_parent_notice' => 'off',   // D216 RISK.2
    ];

    /** events whose SMS is part of a transaction the person is told about (receipts, pay changes): sent even without a marketing consent */
    public const TRANSACTIONAL = ['fee_paid', 'fee_refund', 'salary', 'staff_leave'];

    public static function keys(): array { return array_keys(self::EVENTS); }

    /** event => mode for the institution (stored choices over the defaults) */
    public function modes(Institution $i): array
    {
        $stored = (array) (($i->settings ?? [])['sms_events'] ?? []);
        $out = [];
        foreach (self::EVENTS as $key => $default) $out[$key] = in_array($stored[$key] ?? null, self::MODES, true) ? $stored[$key] : $default;
        return $out;
    }

    public function mode(string $event, ?Institution $i = null): string
    {
        $i ??= Tenancy::current();
        if (!isset(self::EVENTS[$event])) throw new \InvalidArgumentException("unknown SMS event {$event}");
        return $this->modes($i)[$event];
    }

    /**
     * Send (or hold) one event SMS. Returns 'off', 'queued' (auto) or the pending SmsLog (manual).
     * $transactional and $sentBy pass through to SendSmsJob / SmsService unchanged.
     */
    public function dispatch(string $event, string $phone, string $message, ?int $sentBy = null, bool $transactional = false): string|SmsLog
    {
        $i = Tenancy::current() ?? throw new \App\Exceptions\TenantNotBoundException(SmsLog::class);
        return match ($this->mode($event, $i)) {
            'off' => 'off',
            'manual' => SmsLog::create(['to_phone' => $phone, 'message' => $message, 'status' => 'pending', 'event_key' => $event, 'sent_by' => $sentBy,
                'segments' => 1, 'encoding' => 'gsm', 'cost' => '0.00']),
            // after the surrounding transaction commits, as every sender did before (outside a transaction: at once)
            default => tap('queued', fn () => SendSmsJob::dispatch($phone, $message, $i->id, $sentBy, $transactional, $event)->afterCommit()),
        };
    }
}
