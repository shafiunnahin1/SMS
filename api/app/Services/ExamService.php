<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{BatchTeacher, Enrollment, Exam, ExamSubject, Result, Student, Subject, Teacher, User};
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

// Step 4.5 (docs/modules/grading.md "Revision 6.3", academic-structure.md "Exams"): an exam of a program (or of one batch),
// its exam_subjects created from the program's subjects, who sits it, who may enter which marks, and the marksheet numbers.
// Grades are computed only by ResultService::score().
class ExamService
{
    public function __construct(private ResultService $results) {}

    /** New exam + one exam_subjects row per subject of the program (full/pass from the subject) */
    public function create(array $data): Exam
    {
        return DB::transaction(function () use ($data) {
            $exam = Exam::create($data + ['status' => 'upcoming']);
            Subject::where('program_id', $exam->program_id)->orderBy('id')->get()->values()->each(fn ($s, $i) => ExamSubject::create([
                'exam_id' => $exam->id, 'subject_id' => $s->id, 'full_marks' => $s->full_marks ?? 100, 'pass_marks' => $s->pass_marks ?? 33, 'sort_order' => $i,
            ]));
            return $exam;
        });
    }

    public function delete(Exam $exam): void
    {
        if ($exam->status === 'published' || Result::where('exam_id', $exam->id)->exists()) throw new BusinessException('exam has marks', 'in_use', 422);
        DB::transaction(function () use ($exam) {
            ExamSubject::where('exam_id', $exam->id)->delete();
            $exam->delete();
        });
    }

    public function publish(Exam $exam): Exam
    {
        if (!Result::where('exam_id', $exam->id)->exists()) throw new BusinessException('no marks yet', 'no_results', 422);
        $exam->update(['status' => 'published']);
        return $exam;
    }

    /** Edit the exam's subjects (schedule, full/pass marks, components). A changed scale re-grades the marks already saved. */
    public function updateSubjects(Exam $exam, array $rows): Collection
    {
        $this->assertOpen($exam);
        $allowed = Subject::where('program_id', $exam->program_id)->pluck('id')->all();
        return DB::transaction(function () use ($exam, $rows, $allowed) {
            foreach ($rows as $i => $r) {
                if (!in_array((int) $r['subject_id'], $allowed, true)) throw new BusinessException('subject not in program', 'not_in_program', 422);
                $components = !empty($r['components']) ? array_values($r['components']) : null;
                if ($components && abs(array_sum(array_column($components, 'full')) - (float) $r['full_marks']) > 0.001) {
                    throw new BusinessException('components must add up to the full marks', 'components_total', 422, ['full' => $r['full_marks']]);
                }
                $es = ExamSubject::firstOrNew(['exam_id' => $exam->id, 'subject_id' => (int) $r['subject_id']]);
                $es->fill([
                    'full_marks' => $r['full_marks'], 'pass_marks' => $r['pass_marks'], 'components' => $components,
                    'exam_date' => $r['exam_date'] ?? null, 'start_time' => $r['start_time'] ?? null, 'end_time' => $r['end_time'] ?? null,
                    'room' => $r['room'] ?? null, 'sort_order' => $r['sort_order'] ?? $i,
                ]);
                $rescale = $es->exists && $es->isDirty(['full_marks', 'pass_marks', 'components']);
                $es->save();
                if ($rescale) $this->regrade($exam, $es);
            }
            return $this->subjectsOf($exam);
        });
    }

    public function subjectsOf(Exam $exam): Collection
    {
        return ExamSubject::where('exam_id', $exam->id)->with('subject:id,name,teacher_id,is_optional')->orderBy('sort_order')->orderBy('id')->get();
    }

    /** null = every batch of the exam; [] = none; [ids] = only those batches (a batch subject teacher) */
    public function batchesFor(User $user, Exam $exam, int $subjectId): ?array
    {
        if ($user->role === 'admin') return null;
        $teacher = Teacher::where('user_id', $user->id)->first();
        if (!$teacher) return [];
        if ((int) Subject::whereKey($subjectId)->value('teacher_id') === $teacher->id) return null;
        return BatchTeacher::where('teacher_id', $teacher->id)->where('subject_id', $subjectId)
            ->when($exam->batch_id, fn ($q) => $q->where('batch_id', $exam->batch_id))->pluck('batch_id')->map(fn ($v) => (int) $v)->all();
    }

    /** Active enrollments that sit this exam subject (an optional subject: only who chose it), roll order */
    public function sitters(Exam $exam, ExamSubject $es, ?array $batchIds = null): Collection
    {
        return Enrollment::where('program_id', $exam->program_id)->where('status', 'active')
            ->when($exam->batch_id, fn ($q) => $q->where('batch_id', $exam->batch_id))
            ->when($batchIds !== null, fn ($q) => $q->whereIn('batch_id', $batchIds))
            ->when($es->subject?->is_optional, fn ($q) => $q->where('optional_subject_id', $es->subject_id))
            ->with(['student:id,student_id,user_id', 'student.user:id,name', 'batch:id,name'])
            ->orderBy('batch_id')->orderByRaw('roll_no IS NULL')->orderBy('roll_no')->orderBy('id')->get();
    }

    /** Save a subject's marks for students who sit it (and, for a teacher, are in their batches) */
    public function saveMarks(Exam $exam, ExamSubject $es, array $rows, ?array $batchIds): Collection
    {
        $this->assertOpen($exam);
        $sitting = $this->sitters($exam, $es, $batchIds)->pluck('student_id')->map(fn ($v) => (int) $v)->all();
        foreach ($rows as $r) {
            if (!in_array((int) $r['student_id'], $sitting, true)) throw new BusinessException('student does not sit this subject', 'not_in_exam', 422);
        }
        $this->results->bulkSaveMarks($exam, $es->subject_id, $rows);
        return Result::where('exam_id', $exam->id)->where('subject_id', $es->subject_id)->whereIn('student_id', array_column($rows, 'student_id'))->get();
    }

    /** A student's numbers for one exam: per subject + total, percentage, pass, GPA (only with settings.use_gpa) */
    public function sheet(Exam $exam, Student $student, bool $useGpa): array
    {
        $enrollment = Enrollment::where('student_id', $student->id)->where('program_id', $exam->program_id)
            ->when($exam->batch_id, fn ($q) => $q->where('batch_id', $exam->batch_id))->orderByRaw("status = 'active' DESC")->latest('id')->first();
        $results = Result::where('exam_id', $exam->id)->where('student_id', $student->id)->get()->keyBy('subject_id');
        $rows = $this->subjectsOf($exam)
            ->filter(fn ($es) => !$es->subject?->is_optional || (int) $enrollment?->optional_subject_id === $es->subject_id || $results->has($es->subject_id))
            ->map(function ($es) use ($results) {
                $r = $results->get($es->subject_id);
                return ['subject_id' => $es->subject_id, 'subject' => $es->subject?->name, 'full_marks' => $es->full_marks, 'pass_marks' => $es->pass_marks,
                    'components' => $es->components, 'component_marks' => $r?->component_marks, 'marks_obtained' => $r?->marks_obtained,
                    'percentage' => $r?->percentage, 'grade' => $r?->grade, 'grade_point' => $r?->grade_point,
                    'is_absent' => (bool) $r?->is_absent, 'is_pass' => $r ? (bool) $r->is_pass : null, 'remarks' => $r?->teacher_remarks];
            })->values();
        $full = $rows->sum(fn ($r) => (float) $r['full_marks']);
        $got = $rows->sum(fn ($r) => (float) ($r['marks_obtained'] ?? 0));
        $complete = $rows->isNotEmpty() && $rows->every(fn ($r) => $r['is_pass'] !== null);
        $failed = $rows->contains(fn ($r) => $r['is_pass'] === false);        // one failed subject decides it even before the rest is entered
        return [
            'exam' => ['id' => $exam->id, 'name' => $exam->name, 'exam_type' => $exam->exam_type, 'academic_year' => (int) $exam->academic_year, 'status' => $exam->status],
            'student' => ['id' => $student->id, 'student_id' => $student->student_id, 'name' => $student->user?->name,
                'batch' => $enrollment?->batch?->name, 'program' => $exam->program?->name, 'roll_no' => $enrollment?->roll_no],
            'subjects' => $rows,
            'total' => ['full_marks' => round($full, 2), 'obtained' => round($got, 2), 'percentage' => $full > 0 ? round($got / $full * 100, 2) : null,
                'is_pass' => $failed ? false : ($complete ? true : null),
                'gpa' => $useGpa && ($complete || $failed) ? $this->results->gpa($results->toBase()->only($rows->pluck('subject_id')->all())->values()) : null],
            'use_gpa' => $useGpa,
        ];
    }

    private function regrade(Exam $exam, ExamSubject $es): void
    {
        Result::where('exam_id', $exam->id)->where('subject_id', $es->subject_id)->get()->each(fn ($r) => $r->update(
            $this->results->score($es, $r->marks_obtained !== null ? (float) $r->marks_obtained : null, $r->component_marks, (bool) $r->is_absent)));
    }

    private function assertOpen(Exam $exam): void
    {
        if ($exam->status === 'published') throw new BusinessException('exam is published', 'exam_published', 422);
    }
}
