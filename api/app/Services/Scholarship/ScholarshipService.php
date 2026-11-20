<?php

namespace App\Services\Scholarship;

use App\Models\{AuditLog, FeeCategory, Scholarship, ScholarshipApplication, Student, User};
use App\Notifications\GeneralNotification;
use App\Services\ModuleGate;
use App\Support\{Money, Tenancy};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// D236 SCH.1: deciding applications (slots, revocation) and the tuition discount of percentage awards. A percentage award applies to
// the monthly tuition of the months from its approval month up to (not including) its revocation month, inside the scholarship's
// academic year when one is set. Nothing is stored on fee rows: dues are computed, and paid rows never change. Paisa, never float.
class ScholarshipService
{
    private array $awards = [];   // per-request cache: student id => percentage awards

    public function decide(User $by, ScholarshipApplication $a, string $decision): ScholarshipApplication
    {
        return DB::transaction(function () use ($by, $a, $decision) {
            $a = ScholarshipApplication::whereKey($a->id)->lockForUpdate()->firstOrFail();
            if ($a->status !== 'pending') throw ValidationException::withMessages(['decision' => __('scholarship.already_decided')]);
            $s = Scholarship::whereKey($a->scholarship_id)->lockForUpdate()->firstOrFail();
            if ($decision === 'approved') {
                if ($s->available_slots !== null && $s->available_slots <= 0) throw ValidationException::withMessages(['decision' => __('scholarship.no_slot')]);
                $a->update(['status' => 'approved', 'approved_by' => $by->id, 'awarded_amount' => $s->percentage === null ? $s->amount : null]);
                if ($s->available_slots !== null) {
                    $s->available_slots--;
                    if ($s->available_slots === 0 && $s->status === 'open') $s->status = 'awarded';
                    $s->save();
                }
                AuditLog::record('scholarship.approved', $a, ['from' => now()->format('Y-m')]);
            } else {
                $a->update(['status' => 'rejected', 'approved_by' => $by->id]);
                AuditLog::record('scholarship.rejected', $a);
            }
            $this->tell($a, $s, $decision === 'approved' ? 'approved' : 'rejected');
            return $a;
        });
    }

    /** an approval becomes rejected; the slot returns; the discount stops from this month */
    public function revoke(User $by, ScholarshipApplication $a, ?string $reason): ScholarshipApplication
    {
        return DB::transaction(function () use ($by, $a, $reason) {
            $a = ScholarshipApplication::whereKey($a->id)->lockForUpdate()->firstOrFail();
            if ($a->status !== 'approved') throw ValidationException::withMessages(['decision' => __('scholarship.not_approved')]);
            $s = Scholarship::whereKey($a->scholarship_id)->lockForUpdate()->firstOrFail();
            $a->update(['status' => 'rejected', 'approved_by' => $by->id]);
            if ($s->available_slots !== null) {
                $s->available_slots++;
                if ($s->status === 'awarded') $s->status = 'open';
                $s->save();
            }
            AuditLog::record('scholarship.revoked', $a, ['until' => now()->format('Y-m'), 'reason' => $reason]);
            $this->tell($a, $s, 'revoked');
            return $a;
        });
    }

    /** discount in paisa on one month of the student's monthly tuition */
    public function tuitionDiscount(Student $s, FeeCategory $c, int $grossPaisa, string $period): int
    {
        if ($c->frequency !== 'monthly' || !preg_match('/^\d{4}-\d{2}$/', $period) || $grossPaisa <= 0) return 0;
        $institution = Tenancy::current();
        if (!$institution || !app(ModuleGate::class)->allows($institution, 'scholarships')) return 0;
        if ($c->id !== $this->tuitionCategoryId()) return 0;
        $pct = 0;   // in hundredths of a percent
        foreach ($this->awardsOf($s) as $w) {
            if ($period < $w['from'] || ($w['until'] !== null && $period >= $w['until'])) continue;
            if ($w['year_from'] !== null && ($period < $w['year_from'] || $period > $w['year_to'])) continue;
            $pct += $w['pct'];
        }
        return $pct <= 0 ? 0 : Money::ratio($grossPaisa, min($pct, 10000), 10000);
    }

    private ?int $tuitionId = null;
    private bool $tuitionResolved = false;

    /** the institution's tuition: its first monthly category that is not a transport / hostel / mess fee */
    private function tuitionCategoryId(): ?int
    {
        if (!$this->tuitionResolved) {
            $this->tuitionResolved = true;
            $this->tuitionId = FeeCategory::where('frequency', 'monthly')
                ->whereNotIn('name', [\App\Services\Transport\TransportService::FEE_CATEGORY, \App\Services\Hostel\HostelService::FEE_CATEGORY, \App\Services\Hostel\MessService::FEE_CATEGORY])
                ->orderBy('id')->value('id');
        }
        return $this->tuitionId;
    }

    /** every percentage award the student was ever approved for, with its months */
    private function awardsOf(Student $s): array
    {
        return $this->awards[$s->id] ??= ScholarshipApplication::with('scholarship.academicYear')->where('student_id', $s->id)
            ->whereHas('scholarship', fn ($q) => $q->whereNotNull('percentage'))
            ->whereIn('id', AuditLog::where('model', 'ScholarshipApplication')->where('action', 'scholarship.approved')->select('model_id'))
            ->get()->map(function ($a) {
                $logs = AuditLog::where('model', 'ScholarshipApplication')->where('model_id', $a->id)->whereIn('action', ['scholarship.approved', 'scholarship.revoked'])->get();
                $year = $a->scholarship->academicYear;
                return ['pct' => Money::toPaisa($a->scholarship->percentage), 'from' => $logs->firstWhere('action', 'scholarship.approved')->new_data['from'],
                    'until' => $a->status === 'approved' ? null : ($logs->firstWhere('action', 'scholarship.revoked')?->new_data['until'] ?? null),
                    'year_from' => $year?->start_date?->format('Y-m'), 'year_to' => $year?->end_date?->format('Y-m')];
            })->all();
    }

    private function tell(ScholarshipApplication $a, Scholarship $s, string $what): void
    {
        $student = Student::with('parents')->find($a->student_id);
        $student?->parents->each(fn ($p) => $p->notify(new GeneralNotification(__("scholarship.notice_{$what}_title"), __("scholarship.notice_{$what}_body", ['name' => $s->name]), 'scholarship_decision', ['application_id' => $a->id])));
    }
}
