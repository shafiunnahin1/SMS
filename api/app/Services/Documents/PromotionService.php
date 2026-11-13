<?php

namespace App\Services\Documents;

use App\Models\{AuditLog, Batch, Institution, Student};
use App\Services\EnrollmentService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

// D210 PTC.1 (docs/modules/promotion-tc.md "Class Promotion (Bulk)"): the old enrollment ends as `promoted`, a new enrollment in the
// target batch starts (roll numbers fresh, no fee override carried); students are never edited directly. Those who failed are
// simply not chosen. Skipped students (no active enrollment, already there) are reported back.
class PromotionService
{
    public function __construct(private EnrollmentService $enrollments) {}

    public function promote(array $studentIds, int $toBatchId, ?int $fromProgramId = null): array
    {
        $to = Batch::with('program')->findOrFail($toBatchId);
        $result = ['promoted' => 0, 'skipped' => []];
        DB::transaction(function () use ($studentIds, $to, $fromProgramId, &$result) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->value('id');
            foreach (Student::with('activeEnrollments')->whereIn('id', $studentIds)->orderBy('id')->get() as $student) {
                $old = $student->activeEnrollments->first(fn ($e) => $fromProgramId ? (int) $e->program_id === $fromProgramId : (bool) $e->is_primary);
                if (!$old) { $result['skipped'][] = ['id' => $student->id, 'reason' => 'no_active_enrollment']; continue; }
                if ((int) $old->batch_id === $to->id) { $result['skipped'][] = ['id' => $student->id, 'reason' => 'already_in_target']; continue; }
                $this->enrollments->end($old, 'promoted');
                $this->enrollments->enroll($student->fresh(), $to, ['academic_year_id' => $to->academic_year_id]);
                $result['promoted']++;
            }
            $missing = array_values(array_diff($studentIds, Student::whereIn('id', $studentIds)->pluck('id')->all()));
            foreach ($missing as $id) $result['skipped'][] = ['id' => (int) $id, 'reason' => 'not_found'];
            AuditLog::record('students.promoted', $to, ['promoted' => $result['promoted'], 'skipped' => count($result['skipped'])]);
        });
        return $result;
    }
}
