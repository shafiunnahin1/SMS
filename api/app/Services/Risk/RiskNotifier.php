<?php

namespace App\Services\Risk;

use App\Models\{Batch, RiskFlag, Student, User};
use App\Notifications\GeneralNotification;
use App\Services\Sms\SmsEventPolicy;

// D216 RISK.2 (docs/modules/risk-alerts.md section 3): a NEW high combined flag tells the batch's class teacher and the admins in the
// app. Parents are told only when settings.risk.notify_parents is on AND the D208 event `risk_parent_notice` is not off - one
// soft-worded SMS to the guardian phone, never the measured numbers. Students and parents are never shown a flag.
class RiskNotifier
{
    public function __construct(private RiskRules $rules, private SmsEventPolicy $sms) {}

    /** @param RiskFlag[] $written rows written by one evaluator run */
    public function announce(array $written): int
    {
        $n = 0;
        $parents = $this->rules->thresholds()['notify_parents'] && $this->sms->mode('risk_parent_notice') !== 'off';
        $admins = null;
        foreach ($written as $f) {
            if ($f->kind !== 'combined' || $f->level !== 'high') continue;
            $student = Student::with('user:id,name')->find($f->student_id);
            if (!$student) continue;
            $admins ??= User::where('role', 'admin')->get();
            $teacher = $f->batch_id ? Batch::with('teacher.user')->find($f->batch_id)?->teacher?->user : null;
            $body = __('risk.notice_body', ['name' => $student->user?->name, 'id' => $student->student_id]);
            foreach (collect([$teacher, ...$admins])->filter()->unique('id') as $u) {
                $u->notify(new GeneralNotification(__('risk.notice_title'), $body, 'risk_high', ['risk_flag_id' => $f->id, 'student_id' => $student->id]));
            }
            if ($parents && $student->guardian_phone) $this->sms->dispatch('risk_parent_notice', $student->guardian_phone, __('risk.parent_sms', ['name' => $student->user?->name]));
            $n++;
        }
        return $n;
    }
}
