<?php

namespace App\Services;

use App\Models\{Batch, Institution, ParentStudent, Student, User};
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// docs/architecture/backend-pattern.md + academic-structure.md: create the student row (never the program/batch/roll cache),
// its login (username = student ID, that ID as the first password with a forced change), then enroll through EnrollmentService.
// Student ID and parent linking: docs/modules/fees-advanced.md (Revision 7). Photo, documents, import come with Step 4.2.
class StudentService
{
    public function __construct(private EnrollmentService $enrollments) {}

    public function create(array $data, ?Batch $batch = null, array $enrollment = []): Student
    {
        return DB::transaction(function () use ($data, $batch, $enrollment) {
            $data['student_id'] = $data['student_id'] ?? $this->generateStudentId();
            $user = User::create([
                'institution_id' => Tenancy::current()->id, 'name' => $data['name'], 'username' => $data['student_id'],
                'password' => $data['student_id'], 'role' => 'student', 'must_change_password' => true,
            ]);
            $student = Student::create(['user_id' => $user->id] + collect($data)->except(['name', 'guardian_email'])->all());
            if ($this->parentPortalOn()) $this->linkParent($student, $data);
            if ($batch) $this->enrollments->enroll($student, $batch, $enrollment);
            return $student->fresh();
        });
    }

    /** DHA-2026-0001: per institution and year; the institution row lock serialises two admissions at once. Inside a transaction. */
    public function generateStudentId(): string
    {
        $institution = Tenancy::current();
        Institution::whereKey($institution->id)->lockForUpdate()->value('id');
        $prefix = strtoupper(substr($institution->slug, 0, 3)) . '-' . date('Y') . '-';
        $last = Student::withTrashed()->where('student_id', 'like', $prefix . '%')->orderByDesc('student_id')->value('student_id');
        return $prefix . str_pad((string) ($last ? ((int) substr($last, -4)) + 1 : 1), 4, '0', STR_PAD_LEFT);
    }

    /** One parent user per guardian phone; siblings share it. Never the phone as password (R6): random + forced change. */
    public function linkParent(Student $student, array $data): User
    {
        $phone = User::normalisePhone($data['guardian_phone']);
        $parent = User::inTenant()->where('role', 'parent')->where('phone', $phone)->first()
            ?? User::create([
                'institution_id' => Tenancy::current()->id,
                'name' => $data['father_name'] ?? $data['mother_name'] ?? $phone,
                'phone' => $phone, 'email' => $data['guardian_email'] ?? null,
                'password' => Str::random(32), 'must_change_password' => true, 'role' => 'parent',
            ]);
        ParentStudent::firstOrCreate(['parent_user_id' => $parent->id, 'student_id' => $student->id], ['relationship' => 'guardian', 'is_primary' => true]);
        return $parent;
    }

    /** fees-advanced.md: the parent role exists for the type AND (not private_batch OR its student portal is on) */
    private function parentPortalOn(): bool
    {
        $i = Tenancy::current();
        return in_array('parent', config("institution_types.{$i->institution_type}.roles", []), true)
            && ($i->institution_type !== 'private_batch' || app(InstitutionSettings::class)->general($i)['student_portal']);
    }
}
