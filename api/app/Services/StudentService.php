<?php

namespace App\Services;

use App\Models\{Batch, Student, User};
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

// docs/architecture/backend-pattern.md + academic-structure.md: create the student row (never the program/batch/roll cache),
// its login (username = student ID, that ID as the first password with a forced change), then enroll through EnrollmentService.
// The full student module (photo, documents, import, parents) is Step 4.2.
class StudentService
{
    public function __construct(private EnrollmentService $enrollments) {}

    public function create(array $data, ?Batch $batch = null, array $enrollment = []): Student
    {
        return DB::transaction(function () use ($data, $batch, $enrollment) {
            $user = User::create([
                'institution_id' => Tenancy::current()->id, 'name' => $data['name'], 'username' => $data['student_id'],
                'password' => $data['student_id'], 'role' => 'student', 'must_change_password' => true,
            ]);
            $student = Student::create(['user_id' => $user->id] + collect($data)->except('name')->all());
            if ($batch) $this->enrollments->enroll($student, $batch, $enrollment);
            return $student->fresh();
        });
    }
}
