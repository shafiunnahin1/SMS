<?php

namespace App\Imports;

use App\Models\{Exam, ExamSubject, Result, Subject};
use App\Services\{ExamService, ResultService};
use Illuminate\Support\Facades\Validator;

// D193 MIG.1 kind=results (data-migration.md section 3): marks of an old exam. The exam is created once per class and year as
// "[পুরনো] <name>", already published, with the class's subjects (their full / pass marks); grades come from ResultService. No SMS
// or notification. Natural key (exam, student, subject). D32: published results are never deleted - a rollback keeps them.
final class ResultRowImporter extends RowImporter
{
    public function __construct(private Lookup $find, private ExamService $examService, private ResultService $results) {}

    public function fields(): array { return ['exam_name', 'academic_year', 'student_id', 'subject', 'marks', 'is_absent']; }
    public function required(): array { return ['exam_name', 'student_id', 'subject', 'marks']; }
    public function aliases(): array { return ['exam' => 'exam_name', 'year' => 'academic_year', 'student' => 'student_id', 'student_code' => 'student_id', 'mark' => 'marks', 'absent' => 'is_absent']; }

    public function check(array $data): array
    {
        $absent = in_array(mb_strtolower(trim((string) ($data['is_absent'] ?? ''))), ['1', 'yes', 'y', 'true', 'absent', 'a'], true);
        $v = Validator::make($data, ['exam_name' => 'required|string|max:80', 'academic_year' => 'nullable|integer|min:2000|max:2100', 'student_id' => 'required|string',
            'subject' => 'required|string', 'marks' => $absent ? 'nullable' : ['required', 'regex:/^\d{1,4}(\.\d{1,2})?$/']]);
        if ($v->fails()) return $this->result('error', $v->errors()->first(), $data);
        $student = $this->find->student($data['student_id']);
        $programId = $student?->primaryEnrollment?->program_id;
        if (!$student || !$programId) return $this->result('error', __('errors.import_unknown', ['field' => 'student_id', 'value' => $data['student_id']]), $data);
        $subject = Subject::where('program_id', $programId)->where('name', trim($data['subject']))->first();
        if (!$subject) return $this->result('error', __('errors.import_unknown', ['field' => 'subject', 'value' => $data['subject']]), $data);
        $name = '[পুরনো] ' . trim($data['exam_name']);
        $year = (int) (($data['academic_year'] ?? '') ?: now()->year);
        if (!$absent) {
            $full = (float) ($subject->full_marks ?? 100);
            if ((float) $data['marks'] > $full) return $this->result('error', __('errors.import_marks_over', ['full' => $full]), $data);
        }
        if ($dup = $this->duplicate("$name|$year|$programId|{$student->id}|{$subject->id}", $data)) return $dup;
        $exam = Exam::where('name', $name)->where('program_id', $programId)->where('academic_year', $year)->first();
        if ($exam && Result::where('exam_id', $exam->id)->where('student_id', $student->id)->where('subject_id', $subject->id)->exists()) {
            return $this->result('skipped', __('errors.import_exists'), $data);
        }
        return $this->result('ok', null, $data + ['_r' => ['name' => $name, 'year' => $year, 'program_id' => $programId, 'student_id' => $student->id,
            'subject_id' => $subject->id, 'marks' => $absent ? null : (float) $data['marks'], 'absent' => $absent]]);
    }

    public function create(array $data): array
    {
        $r = $data['_r'];
        $exam = Exam::where('name', $r['name'])->where('program_id', $r['program_id'])->where('academic_year', $r['year'])->first()
            ?? tap($this->examService->create(['name' => $r['name'], 'program_id' => $r['program_id'], 'exam_type' => 'term', 'academic_year' => $r['year']]),
                fn ($e) => $e->update(['status' => 'published']));
        $es = ExamSubject::where('exam_id', $exam->id)->where('subject_id', $r['subject_id'])->firstOrFail();   // the exam copies every subject of the class
        $row = Result::create(['exam_id' => $exam->id, 'student_id' => $r['student_id'], 'subject_id' => $r['subject_id']]
            + $this->results->score($es, $r['marks'], null, $r['absent']));
        return ['results', $row->id];
    }

    public function undo(string $table, int $id): ?string
    {
        return __('errors.import_results_kept');
    }
}
