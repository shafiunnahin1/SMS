<?php

namespace App\Imports;

use App\Models\{Attendance, Batch, Enrollment, FeePayment, ParentStudent, Result, Student, User};
use App\Support\StudentFiles;
use App\Services\StudentService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;

// kind=students (data-migration.md section 1; row rules from student-import.md): one mapped row -> a student, their login, the
// parent link and the enrollment(s) - always through StudentService / EnrollmentService. Natural key: the student ID code; a file
// without codes uses name + guardian phone, so running the same file twice skips every row the second time.
final class StudentRowImporter extends RowImporter
{
    public const FIELDS = ['name', 'guardian_phone', 'batch', 'student_id', 'roll_no', 'gender', 'date_of_birth', 'father_name', 'mother_name',
        'address', 'admission_date', 'studying_at'];
    public const REQUIRED = ['name', 'guardian_phone', 'batch'];

    private Collection $batches;

    public function __construct(private StudentService $students)
    {
        $this->batches = Batch::with('program:id,name')->get();
    }

    /** @return array{status: 'ok'|'error'|'skipped', error: ?string, data: array} - nothing is written */
    public function check(array $data): array
    {
        $v = Validator::make($data, [
            'name' => 'required|string|max:100', 'guardian_phone' => ['required', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'batch' => 'required|string', 'student_id' => ['nullable', 'string', 'regex:/^[0-9]{10}$/'],   // D160: 10 digits only 'roll_no' => 'nullable|integer|min:1',
            'gender' => 'nullable|in:male,female,other', 'date_of_birth' => 'nullable|date|before:today', 'admission_date' => 'nullable|date',
            'father_name' => 'nullable|string|max:100', 'mother_name' => 'nullable|string|max:100', 'address' => 'nullable|string|max:500',
            'studying_at' => 'nullable|string|max:150',
        ]);
        if ($v->fails()) return $this->result('error', $v->errors()->first(), $data);
        $batchIds = $this->batchIds($data['batch']);
        if ($batchIds === null) return $this->result('error', __('errors.import_batch_unknown', ['value' => $data['batch']]), $data);

        if ($dup = $this->duplicate($this->key($data), $data)) return $dup;
        if ($this->exists($data)) return $this->result('skipped', __('errors.import_exists'), $data);
        return $this->result('ok', null, $data + ['_batch_ids' => $batchIds]);
    }

    public function fields(): array { return self::FIELDS; }
    public function required(): array { return self::REQUIRED; }
    public function aliases(): array
    {
        return ['batch_id' => 'batch', 'section' => 'batch', 'phone' => 'guardian_phone', 'mobile' => 'guardian_phone', 'dob' => 'date_of_birth', 'roll' => 'roll_no'];
    }

    /** Creates the student. Called only for rows check() passed. */
    public function create(array $data): array
    {
        $batches = $data['_batch_ids'];
        $profile = array_filter(array_intersect_key($data, array_flip(array_diff(self::FIELDS, ['batch', 'roll_no']))), fn ($v) => $v !== '' && $v !== null);
        $profile['gender'] = isset($profile['gender']) ? strtolower($profile['gender']) : null;
        $student = $this->students->create(array_filter($profile, fn ($v) => $v !== null), Batch::findOrFail($batches[0]),
            array_filter(['roll_no' => $data['roll_no'] ?? null], fn ($v) => $v !== null && $v !== ''));
        foreach (array_slice($batches, 1) as $bid) app(\App\Services\EnrollmentService::class)->enroll($student, Batch::findOrFail($bid));
        return ['students', $student->id];
    }

    /** Removes the student, the login, the parent link and enrollments - not when fees, attendance or results exist since */
    public function undo(string $table, int $id): ?string
    {
        $student = Student::withTrashed()->find($id);
        if (!$student) return null;
        if (FeePayment::where('student_id', $student->id)->exists() || Attendance::where('student_id', $student->id)->exists()
            || Result::where('student_id', $student->id)->exists()) return __('errors.import_has_dependents');
        Enrollment::where('student_id', $student->id)->delete();
        ParentStudent::where('student_id', $student->id)->delete();
        StudentFiles::deleteAll($student);
        $userId = $student->user_id;
        $student->forceDelete();
        if ($userId) User::whereKey($userId)->delete();
        return null;
    }

    /** An id, a batch name, "Program - Batch" / "Program — Batch"; coaching: several separated by commas. null = unknown. */
    private function batchIds(string $value): ?array
    {
        $ids = [];
        foreach (array_filter(array_map('trim', explode(',', $value))) as $part) {
            $match = is_numeric($part) ? $this->batches->where('id', (int) $part)
                : $this->batches->filter(fn ($b) => in_array(mb_strtolower($part), [mb_strtolower($b->name),
                    mb_strtolower(($b->program?->name ?? '') . ' - ' . $b->name), mb_strtolower(($b->program?->name ?? '') . ' — ' . $b->name)], true));
            if ($match->count() !== 1) return null;                 // unknown, or a name two batches share (ambiguous)
            $ids[] = $match->first()->id;
        }
        return $ids ?: null;
    }

    private function key(array $d): string
    {
        return !empty($d['student_id']) ? 'id:' . mb_strtolower($d['student_id']) : 'np:' . mb_strtolower($d['name']) . '|' . User::normalisePhone($d['guardian_phone']);
    }

    private function exists(array $d): bool
    {
        if (!empty($d['student_id'])) return Student::withTrashed()->where('student_id', $d['student_id'])->exists();
        return Student::where('guardian_phone', 'like', '%' . substr(User::normalisePhone($d['guardian_phone']), -10))
            ->whereHas('user', fn ($u) => $u->where('name', $d['name']))->exists();
    }

}
