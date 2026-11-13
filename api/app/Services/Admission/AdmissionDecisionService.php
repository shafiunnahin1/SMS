<?php

namespace App\Services\Admission;

use App\Exceptions\BusinessException;
use App\Models\{AdmissionCycle, AdmissionLead, AuditLog, Institution};
use App\Services\Sms\SmsEventPolicy;
use App\Services\SmsService;
use Illuminate\Support\Facades\DB;

// D209 ACY.4 (docs/modules/admission-cycle.md section 4): after the list. A selected applicant has `confirm_within_days` to confirm
// (the deadline is the lead's follow_up_date; a confirmed applicant has none). Declining - or letting the deadline pass
// (admission:promote) - offers the seat to the next waiting applicant by rank, the order never changes. Admitting goes through the
// existing lead convert (a Student + enrollment) and marks the applicant admitted. The result SMS follows the D208 event
// `admission_result` (default off).
class AdmissionDecisionService
{
    /** a selected applicant's confirmation deadline */
    public function offer(AdmissionLead $lead, AdmissionCycle $c): void
    {
        $lead->update(['list_status' => 'selected', 'follow_up_date' => now()->addDays((int) ($c->rule['confirm_within_days'] ?? 7))->toDateString()]);
    }

    public function confirm(AdmissionLead $lead): AdmissionLead
    {
        return DB::transaction(function () use ($lead) {
            [$lead, $c] = $this->locked($lead);
            if ($lead->list_status !== 'selected') throw new BusinessException('only a selected applicant confirms', 'lead_not_selected', 422);
            $lead->update(['follow_up_date' => null]);
            AuditLog::record('admission.confirmed', $lead);
            return $lead;
        });
    }

    /** declined (by the applicant, or the deadline passed): a selected seat goes to the next waiting applicant; returns the promoted lead */
    public function decline(AdmissionLead $lead, string $why = 'declined'): ?AdmissionLead
    {
        return DB::transaction(function () use ($lead, $why) {
            [$lead, $c] = $this->locked($lead);
            if (!in_array($lead->list_status, ['selected', 'waiting'], true)) throw new BusinessException('nothing to decline', 'lead_not_selected', 422);
            $wasSelected = $lead->list_status === 'selected';
            $lead->update(['list_status' => 'declined', 'follow_up_date' => null]);
            AuditLog::record('admission.declined', $lead, ['why' => $why]);
            if (!$wasSelected) return null;
            $next = AdmissionLead::where('cycle_id', $c->id)->where('list_status', 'waiting')->orderBy('merit_rank')->lockForUpdate()->first();
            if (!$next) return null;
            $this->offer($next, $c);
            AuditLog::record('admission.promoted', $next, ['rank' => $next->merit_rank]);
            if (app(SmsEventPolicy::class)->mode('admission_result') !== 'off') $this->sms($next, $c);
            return $next;
        });
    }

    public function markAdmitted(AdmissionLead $lead): void
    {
        $lead->update(['list_status' => 'admitted', 'follow_up_date' => null]);
        AuditLog::record('admission.admitted', $lead, ['student_id' => $lead->converted_student_id]);
    }

    /** the applicant must be selected in a listing cycle and not yet a student */
    public function assertAdmittable(AdmissionLead $lead): void
    {
        $c = $lead->cycle;
        if (!$c || $c->status !== 'listing') throw new BusinessException('the cycle is not listing', 'cycle_wrong_state', 422);
        if ($lead->list_status !== 'selected') throw new BusinessException('only a selected applicant is admitted', 'lead_not_selected', 422);
    }

    /** the selected applicants whose deadline passed are declined and the waiting list moves up; returns how many moved */
    public function promoteExpired(): int
    {
        $moved = 0;
        $expired = AdmissionLead::where('list_status', 'selected')->whereNotNull('follow_up_date')->whereDate('follow_up_date', '<', now()->toDateString())
            ->whereHas('cycle', fn ($q) => $q->where('status', 'listing'))->orderBy('merit_rank')->get();
        foreach ($expired as $lead) { $this->decline($lead, 'deadline'); $moved++; }
        return $moved;
    }

    /** one result SMS per ranked applicant (selected / waiting / rejected); off = 422 */
    public function sendResults(AdmissionCycle $c): int
    {
        if (app(SmsEventPolicy::class)->mode('admission_result') === 'off') throw new BusinessException('this kind of SMS is off', 'sms_event_off', 422);
        if (!in_array($c->status, ['listing', 'closed'], true)) throw new BusinessException('no list yet', 'cycle_wrong_state', 422);
        $n = 0;
        foreach (AdmissionLead::where('cycle_id', $c->id)->whereIn('list_status', ['selected', 'waiting', 'rejected'])->orderBy('id')->get() as $lead) { $this->sms($lead, $c); $n++; }
        AuditLog::record('admission.result_sms', $c, ['count' => $n]);
        return $n;
    }

    private function sms(AdmissionLead $lead, AdmissionCycle $c): void
    {
        $i = Institution::find($c->institution_id);
        $loc = app(SmsService::class)->localeFor(null, $i);
        $text = __("admission.sms.{$lead->list_status}", ['no' => $lead->application_no, 'cycle' => $c->name, 'date' => $lead->follow_up_date?->format('d/m/Y') ?? ''], $loc);
        app(SmsEventPolicy::class)->dispatch('admission_result', $lead->phone, $text);
    }

    private function locked(AdmissionLead $lead): array
    {
        $lead = AdmissionLead::whereKey($lead->id)->lockForUpdate()->firstOrFail();
        $c = $lead->cycle_id ? AdmissionCycle::whereKey($lead->cycle_id)->lockForUpdate()->first() : null;
        if (!$c || $c->status !== 'listing') throw new BusinessException('the cycle is not listing', 'cycle_wrong_state', 422);
        return [$lead, $c];
    }
}
