<?php

namespace App\Services;

use App\Models\Student;

/**
 * D159 (4): the student ID printed in bubbles on an OMR sheet - exactly 10 digits: the student's date (admission date, else the day
 * the record was made) as YYYYmmdd, then the last 2 digits of the database id (e.g. 2026102401). It never changes. Reading it back
 * is unambiguous only when exactly one student of the institution has it; otherwise the sheet is matched by roll and reviewed.
 */
class StudentOmrId
{
    public static function of(Student $student): string
    {
        $date = $student->admission_date ?? $student->created_at;
        return ($date ? $date->format('Ymd') : '00000000') . str_pad((string) ($student->id % 100), 2, '0', STR_PAD_LEFT);
    }

    /** the students (this tenant) whose OMR ID is $digits: [] none, [one] a match, [several] ambiguous */
    public function find(string $digits): array
    {
        if (!preg_match('/^(\d{4})(\d{2})(\d{2})(\d{2})$/', $digits, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) return [];
        $day = "{$m[1]}-{$m[2]}-{$m[3]}";
        return Student::where(fn ($q) => $q->whereDate('admission_date', $day)->orWhere(fn ($q) => $q->whereNull('admission_date')->whereDate('created_at', $day)))
            ->get(['id', 'admission_date', 'created_at'])->filter(fn ($s) => self::of($s) === $digits)->pluck('id')->map(fn ($v) => (int) $v)->values()->all();
    }
}
