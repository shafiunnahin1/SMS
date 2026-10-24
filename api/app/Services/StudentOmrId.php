<?php

namespace App\Services;

use App\Models\Student;

/**
 * D159 (4) / D160 (2): the ID printed in bubbles on an OMR sheet IS the student's ID - exactly 10 digits (YYmmdd + the day's global
 * serial). A student whose ID is not yet in that form (an old ID with letters, before the owner's conversion) has no OMR ID and is
 * matched by roll as before.
 */
class StudentOmrId
{
    public static function of(Student $student): ?string
    {
        return preg_match('/^\d{10}$/', (string) $student->student_id) ? (string) $student->student_id : null;
    }

    /** the students (this tenant) whose ID is $digits: [] none, [one] a match */
    public function find(string $digits): array
    {
        if (!preg_match('/^\d{10}$/', $digits)) return [];
        return Student::where('student_id', $digits)->pluck('id')->map(fn ($v) => (int) $v)->all();
    }
}
