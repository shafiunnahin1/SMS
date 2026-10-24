<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Batch, Enrollment, Institution, ParentStudent, Student, User};
use App\Support\StudentFiles;
use Illuminate\Http\UploadedFile;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// docs/architecture/backend-pattern.md + academic-structure.md: create the student row (never the program/batch/roll cache),
// its login (username = student ID, that ID as the first password with a forced change), then enroll through EnrollmentService.
// Student ID and parent linking: docs/modules/fees-advanced.md (Revision 7). Files: docs/architecture/file-storage.md (StudentFiles).
class StudentService
{
    public function __construct(private EnrollmentService $enrollments) {}

    public function create(array $data, ?Batch $batch = null, array $enrollment = []): Student
    {
        return DB::transaction(function () use ($data, $batch, $enrollment) {
            $data['student_id'] = $data['student_id'] ?? $this->generateStudentId($data['admission_date'] ?? null);
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

    /** PUT /students/{id}: profile fields; a new guardian phone moves the primary parent link to that phone's parent */
    public function update(Student $student, array $data, ?UploadedFile $photo = null): Student
    {
        return DB::transaction(function () use ($student, $data, $photo) {
            if (array_key_exists('name', $data)) $student->user?->forceFill(['name' => $data['name']])->save();
            if (isset($data['student_id']) && $student->user) $student->user->forceFill(['username' => $data['student_id']])->save();
            $oldPhone = $student->guardian_phone;
            $student->fill(collect($data)->except(['name', 'photo'])->all());
            if ($photo) $student->photo = StudentFiles::storePhoto($student, $photo);
            $student->save();
            if (isset($data['guardian_phone']) && User::normalisePhone($data['guardian_phone']) !== User::normalisePhone($oldPhone) && $this->parentPortalOn()) {
                ParentStudent::where('student_id', $student->id)->where('is_primary', true)->delete();
                $this->linkParent($student, $data + ['father_name' => $student->father_name, 'mother_name' => $student->mother_name]);
            }
            return $student->fresh();
        });
    }

    /** DELETE /students/{id}: a soft delete. Active enrollments end as `dropped` (history stays), the login is switched off and every
     *  file under the student's folder is removed. Full anonymisation (erasure) is Step 8.1. */
    public function delete(Student $student): void
    {
        DB::transaction(function () use ($student) {
            Enrollment::where('student_id', $student->id)->where('status', 'active')->get()
                ->each(fn (Enrollment $e) => $this->enrollments->end($e, 'dropped', 'student deleted'));
            $student->user?->forceFill(['is_active' => false])->save();
            $student->forceFill(['photo' => null, 'status' => 'inactive'])->save();
            $student->delete();
        });
        StudentFiles::deleteAll($student);        // after the commit: a rolled-back delete must not lose the files
    }

    /** DHA-2026-0001: per institution and year; the institution row lock serialises two admissions at once. Inside a transaction. */
    /**
     * D160: a student's ID is 10 digits - the admission date (else today) as YYmmdd plus a 4-digit serial for that date shared by every
     * institution (0001-9999), so IDs are unique across the system and never change. A named lock serialises the count across tenants;
     * when the day's 9999 are used, registration for that date is refused.
     */
    public function generateStudentId(?string $admissionDate = null): string
    {
        $prefix = \Illuminate\Support\Carbon::parse($admissionDate ?: now())->format('ymd');
        $locked = DB::selectOne('SELECT GET_LOCK(?, 10) AS l', ['student_id_serial'])->l ?? 0;   // guard:allow(C7) a named MySQL lock, no tenant data
        if ((int) $locked !== 1) throw new BusinessException('student id busy', 'student_id_busy', 503);
        try {
            $last = Student::anyInstitution()->withTrashed()->where('student_id', 'like', $prefix . '____')->whereRaw('student_id REGEXP ?', ['^[0-9]{10}$'])->max('student_id');
            $serial = $last ? ((int) substr($last, -4)) + 1 : 1;
            if ($serial > 9999) throw new BusinessException('the day is full', 'student_id_day_full', 422);
            return $prefix . str_pad((string) $serial, 4, '0', STR_PAD_LEFT);
        } finally {
            DB::selectOne('SELECT RELEASE_LOCK(?) AS r', ['student_id_serial']);                    // guard:allow(C7)
        }
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
