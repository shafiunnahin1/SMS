<?php

namespace Database\Seeders;

use App\Models\{AcademicYear, Batch, Institution, ParentStudent, Program, Student, Subject, Teacher, User};
use App\Services\EnrollmentService;
use App\Support\Tenancy;
use Illuminate\Database\Seeder;

// docs/database/seeders.md "DemoDataSeeder": a teacher, an accountant, ten Class 10 students and the Class 10 subjects of the demo school
class DemoDataSeeder extends Seeder
{
    public function run(): void
    {
        $institution = Institution::where('slug', 'dhanmondi-school')->firstOrFail();

        Tenancy::as($institution, function (Institution $institution) {
            $class10 = Program::where('numeric_name', 10)->firstOrFail();
            $batchA = Batch::where('program_id', $class10->id)->where('name', 'A')->firstOrFail();

            AcademicYear::create(['name' => '2025', 'start_date' => '2025-01-01', 'end_date' => '2025-12-31', 'is_current' => true]);

            $teacherUser = User::create([
                'institution_id' => $institution->id, 'name' => 'মো: করিম উদ্দিন', 'email' => 'teacher@dhanmondischool.edu.bd',
                'phone' => '01722222222', 'password' => 'Teacher@1234', 'role' => 'teacher',
            ]);
            $teacher = Teacher::create([
                'user_id' => $teacherUser->id, 'employee_id' => 'EMP-2025-0001', 'designation' => 'সহকারী শিক্ষক', 'salary' => 15000,
            ]);
            // Step 4.3: a teacher takes attendance only in their own batches - the demo teacher is Class 10-A's batch teacher (DECISIONS 2026-10-10 4.3)
            $batchA->forceFill(['teacher_id' => $teacher->id])->save();

            // never write program_id / batch_id / roll_no on students directly - EnrollmentService does it
            $enrollments = app(EnrollmentService::class);
            $first = [];
            for ($i = 1; $i <= 10; $i++) {
                $code = sprintf('DHA-2025-%04d', $i);
                $studentUser = User::create([
                    'institution_id' => $institution->id, 'name' => "ছাত্র $i", 'email' => "student{$i}@dhanmondischool.edu.bd",
                    'username' => $code, 'password' => $code, 'role' => 'student', 'must_change_password' => true,
                ]);
                $student = Student::create([
                    'user_id' => $studentUser->id, 'student_id' => $code, 'guardian_phone' => sprintf('019000000%02d', $i),
                    'father_name' => "অভিভাবক $i", 'admission_date' => now()->subMonths(3), 'status' => 'active',
                ]);
                $enrollments->enroll($student, $batchA, ['roll_no' => $i]);
                if ($i <= 2) $first[] = $student;
            }

            // Spike S6: a demo parent of the first two students (to try the child switcher). Not in seeders.md -
            // DECISIONS 2026-10-06 S. Real parents get a random password and set their own through "forgot password".
            $parent = User::create(['institution_id' => $institution->id, 'name' => 'অভিভাবক ১', 'phone' => '01900000001',
                'password' => 'Parent@1234', 'role' => 'parent']);
            foreach ($first as $child) ParentStudent::create(['parent_user_id' => $parent->id, 'student_id' => $child->id, 'relationship' => 'guardian', 'is_primary' => true]);

            User::create([
                'institution_id' => $institution->id, 'name' => 'হিসাবরক্ষক', 'email' => 'accountant@dhanmondischool.edu.bd',
                'phone' => '01733333333', 'password' => 'Accountant@1234', 'role' => 'accountant',
            ]);

            foreach (['বাংলা', 'ইংরেজি', 'গণিত', 'পদার্থবিজ্ঞান', 'রসায়ন', 'জীববিজ্ঞান', 'ইতিহাস'] as $name) {
                Subject::create(['program_id' => $class10->id, 'teacher_id' => $teacher->id, 'name' => $name, 'full_marks' => 100, 'pass_marks' => 33]);
            }
        });
    }
}
