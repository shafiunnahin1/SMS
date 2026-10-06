<?php

namespace App\Services;

use App\Models\{Batch, Enrollment, Student};
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// docs/modules/academic-structure.md "The Five Rules": enrollments are the truth of batch membership;
// students.program_id / batch_id / roll_no are a cache of the primary active enrollment, written ONLY here.
class EnrollmentService
{
    /** Types where a student may hold only ONE active enrollment */
    private const SINGLE = ['school', 'college'];

    public function enroll(Student $student, Batch $batch, array $data = []): Enrollment
    {
        return DB::transaction(function () use ($student, $batch, $data) {
            $type = Tenancy::current()->institution_type;

            $active = $student->activeEnrollments()->lockForUpdate()->get();

            if ($active->contains('batch_id', $batch->id)) {
                throw ValidationException::withMessages(['batch_id' => 'এই Student ইতিমধ্যে এই batch-এ আছে']);
            }
            if (in_array($type, self::SINGLE, true) && $active->isNotEmpty()) {
                throw ValidationException::withMessages(['batch_id' => 'আগে বর্তমান ভর্তি শেষ করুন (transfer বা promotion ব্যবহার করুন)']);
            }
            $count = Enrollment::where('batch_id', $batch->id)->where('status', 'active')->lockForUpdate()->count();
            if ($batch->max_capacity && $count >= $batch->max_capacity) {
                throw ValidationException::withMessages(['batch_id' => "এই batch-এ সর্বোচ্চ {$batch->max_capacity} জন ভর্তি করা যাবে"]);
            }

            $enrollment = Enrollment::create([
                'student_id'          => $student->id,
                'program_id'          => $batch->program_id,
                'batch_id'            => $batch->id,
                'academic_year_id'    => $data['academic_year_id'] ?? $batch->academic_year_id,
                'roll_no'             => $data['roll_no'] ?? ($count + 1),
                'optional_subject_id' => $data['optional_subject_id'] ?? null,
                'fee_override'        => $data['fee_override'] ?? null,
                'enrolled_at'         => $data['enrolled_at'] ?? today(),
                'is_primary'          => $active->isEmpty(),
                'status'              => 'active',
            ]);

            $this->syncCache($student);
            return $enrollment;
        });
    }

    /** $status: dropped | completed | transferred | promoted - the row stays (history), it is never deleted */
    public function end(Enrollment $enrollment, string $status, ?string $note = null): void
    {
        if (!in_array($status, ['dropped', 'completed', 'transferred', 'promoted'], true)) {
            throw ValidationException::withMessages(['status' => 'Unknown enrollment end status']);
        }
        DB::transaction(function () use ($enrollment, $status, $note) {
            $enrollment->update(['status' => $status, 'left_at' => today(), 'is_primary' => false, 'note' => $note]);

            $student = $enrollment->student;
            // promote the oldest remaining active enrollment to primary
            $next = $student->activeEnrollments()->orderBy('enrolled_at')->orderBy('id')->first();
            if ($next && !$student->primaryEnrollment()->exists()) {
                $next->update(['is_primary' => true]);
            }
            $this->syncCache($student);
        });
    }

    /** Move within the same institution: Section A -> Section B, or batch change */
    public function transfer(Enrollment $from, Batch $to, array $data = []): Enrollment
    {
        return DB::transaction(function () use ($from, $to, $data) {
            $this->end($from, 'transferred');
            return $this->enroll($from->student, $to, $data + ['fee_override' => $from->fee_override]);
        });
    }

    /** The ONLY place that writes students.program_id / batch_id / roll_no */
    public function syncCache(Student $student): void
    {
        $primary = $student->primaryEnrollment()->first();
        $student->forceFill([
            'program_id' => $primary?->program_id,
            'batch_id'   => $primary?->batch_id,
            'roll_no'    => $primary?->roll_no,
        ])->saveQuietly();
    }
}
