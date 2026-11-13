<?php

namespace App\Services\Substitution;

use App\Models\{Batch, LeaveApplication, LeaveSubstitutionEvent, Program, Subject, Teacher, User};
use App\Notifications\GeneralNotification;
use App\Services\SmsService;
use App\Support\Tenancy;
use Carbon\Carbon;

// D200 SUBL.4 (docs/API.md D199 notifications): in-app only, written in the SAME transaction as the event (so both commit or
// neither), one per recipient per event: the notification carries delivery_key = leave-substitution:{institution}:{event}:{user}:
// database and a recipient who already has that key is skipped - a replay or a retried transaction never adds a second notice.
// The body has the date, time, class / subject, the other teacher's name - never the leave reason. D201: the same text also goes by SMS.
class SubstitutionNotifier
{
    /** @param int|null $oldTarget the Teacher who held the slot before this event (for cleared / invalidated covers) */
    public function notify(LeaveSubstitutionEvent $e, ?int $oldTarget = null, ?string $as = null): void
    {
        $type = $as ?? $e->event_type;   // a slot created already offered is told as an offer
        $applicant = LeaveApplication::whereKey($e->leave_application_id)->value('user_id');
        $userOf = fn (?int $teacherId) => $teacherId ? Teacher::whereKey($teacherId)->value('user_id') : null;
        $ids = match ($type) {
            'offer_created', 'cover_replaced' => [$userOf($e->substitute_teacher_id)],
            'offer_accepted', 'offer_declined' => [$this->offeredBy($e), $applicant],
            'cover_cleared', 'source_invalidated', 'substitute_leave_invalidated', 'leave_cancelled', 'leave_rejected' => [$userOf($oldTarget), $oldTarget ? $applicant : null],
            'source_refreshed' => User::inTenant()->where('role', 'admin')->where('is_active', true)->pluck('id')->all(),
            default => [],
        };
        $ids = array_values(array_unique(array_filter($ids)));
        if (!$ids) return;
        $institution = Tenancy::current();
        $names = ['program' => Program::whereKey($e->source_program_id)->value('name'), 'batch' => $e->source_batch_id ? Batch::whereKey($e->source_batch_id)->value('name') : null,
            'subject' => Subject::whereKey($e->source_subject_id)->value('name')];
        $teacher = fn (?int $id) => $id ? User::inTenant()->whereKey($userOf($id))->value('name') : null;
        $vars = ['date' => Carbon::parse($e->occurrence_date)->format('d/m/Y'), 'time' => substr((string) $e->source_start_time, 0, 5) . '-' . substr((string) $e->source_end_time, 0, 5),
            'class' => trim(($names['program'] ?? '') . ($names['batch'] ? ' ' . $names['batch'] : '')), 'subject' => (string) $names['subject'],
            'original' => (string) $teacher($e->original_teacher_id), 'substitute' => (string) $teacher($e->substitute_teacher_id ?? $oldTarget)];
        foreach (User::inTenant()->whereIn('id', $ids)->where('is_active', true)->get() as $u) {
            $key = "leave-substitution:{$institution->id}:{$e->id}:{$u->id}:database";
            if ($u->notifications()->where('data->data->delivery_key', $key)->exists()) continue;
            $loc = app(SmsService::class)->localeFor($u, $institution);
            // D201 SUBM.2: every cover notice is also an SMS when the recipient has a phone and has not switched SMS (or this kind) off.
            // The intent is this row's `sms` state, written with the event; the job is queued only after the commit.
            $prefs = $u->notification_preferences ?? [];
            $sms = $u->phone && ($prefs['sms'] ?? true) && ($prefs['leave_substitution'] ?? true) ? 'pending' : 'skipped';
            // D208: the institution's choice for this event - off: no SMS; manual: it waits in the SMS history; auto: as before
            $mode = app(\App\Services\Sms\SmsEventPolicy::class)->mode('substitution', $institution);
            if ($sms === 'pending' && $mode === 'off') $sms = 'skipped';
            if ($sms === 'pending' && $mode === 'manual') $sms = 'manual';
            $notice = new GeneralNotification(__('substitution.title', [], $loc), __('substitution.' . $type, $vars, $loc), 'leave_substitution',
                ['delivery_key' => $key, 'leave_id' => $e->leave_application_id, 'slot_id' => $e->leave_substitution_slot_id, 'version' => $e->version, 'status' => $e->result_status, 'sms' => $sms]);
            $notice->id = (string) \Illuminate\Support\Str::uuid();   // set here: the sender only fills the id on its own clone
            $u->notify($notice);
            if ($sms === 'pending') \App\Jobs\SendSubstitutionSmsJob::dispatch($u->id, (string) $notice->id, $institution->id)->afterCommit();
            if ($sms === 'manual') app(\App\Services\Sms\SmsEventPolicy::class)->dispatch('substitution', $u->phone, __('substitution.' . $type, $vars, $loc));
        }
    }

    /** the reviewer whose offer is being answered */
    private function offeredBy(LeaveSubstitutionEvent $e): ?int
    {
        return LeaveSubstitutionEvent::where('leave_substitution_slot_id', $e->leave_substitution_slot_id)->whereIn('event_type', ['offer_created', 'cover_replaced', 'slot_created'])
            ->where('result_status', 'offered')->where('version', '<', $e->version)->orderByDesc('version')->value('user_id');
    }
}
