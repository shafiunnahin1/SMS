<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\{Batch, BatchTeacher, Enrollment, Exam, ExamSubject, FeeStructure, Program, Result, Subject, Teacher, TeacherSubject};
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// docs/modules/academic-structure.md: Program -> Batch (-> Enrollment, owned by EnrollmentService). Nothing that has members or
// history is deleted - DELETE answers 422 `in_use` and the admin archives instead (status / is_active).
class AcademicStructureService
{
    public function __construct(private InstitutionSettings $settings) {}

    public function deleteProgram(Program $program): void
    {
        if ($program->is_default) throw new BusinessException('default program', 'in_use', 422);
        $used = Batch::where('program_id', $program->id)->exists() || Subject::where('program_id', $program->id)->exists()
            || Exam::where('program_id', $program->id)->exists() || FeeStructure::where('program_id', $program->id)->exists();
        if ($used) throw new BusinessException('program in use', 'in_use', 422);
        $program->delete();
    }

    /** Create or update a batch with its class teacher and subject teachers */
    public function saveBatch(array $data, ?Batch $batch = null): Batch
    {
        return DB::transaction(function () use ($data, $batch) {
            if (!$batch && empty($data['program_id'])) $data['program_id'] = $this->defaultProgram()->id;
            $subjectTeachers = $data['subject_teachers'] ?? null;
            unset($data['subject_teachers']);

            $batch ??= new Batch();
            $batch->fill($data)->save();
            if ($subjectTeachers !== null) $this->syncSubjectTeachers($batch, $subjectTeachers);
            return $batch->fresh();
        });
    }

    public function deleteBatch(Batch $batch): void
    {
        // any enrollment, whatever its status, is history (rule 5): archive the batch instead
        if (Enrollment::where('batch_id', $batch->id)->exists()) throw new BusinessException('batch in use', 'in_use', 422);
        DB::transaction(function () use ($batch) {
            BatchTeacher::where('batch_id', $batch->id)->delete();
            $batch->delete();
        });
    }

    public function deleteSubject(Subject $subject): void
    {
        $used = ExamSubject::where('subject_id', $subject->id)->exists() || Result::where('subject_id', $subject->id)->exists();
        if ($used) throw new BusinessException('subject in use', 'in_use', 422);
        DB::transaction(function () use ($subject) {
            BatchTeacher::where('subject_id', $subject->id)->delete();
            TeacherSubject::where('subject_id', $subject->id)->delete();
            $subject->delete();
        });
    }

    /** Batches a teacher teaches: as class teacher or through batch_teachers */
    public function batchesOf(Teacher $teacher)
    {
        $ids = BatchTeacher::where('teacher_id', $teacher->id)->pluck('batch_id');
        return Batch::with('program:id,name')->where(fn ($q) => $q->where('teacher_id', $teacher->id)->orWhereIn('id', $ids))
            ->whereIn('status', ['upcoming', 'running'])->orderBy('program_id')->orderBy('name')->get();
    }

    /** The private-batch "General" program (OnboardingService creates it; made here if an old tenant lacks it) */
    public function defaultProgram(): Program
    {
        return Program::where('is_default', true)->first() ?? Program::create(['name' => 'General', 'is_default' => true]);
    }

    private function syncSubjectTeachers(Batch $batch, array $rows): void
    {
        $subjects = Subject::where('program_id', $batch->program_id)->pluck('id')->all();
        foreach ($rows as $i => $r) {
            if ((int) $r['subject_id'] !== 0 && !in_array((int) $r['subject_id'], $subjects, true)) {
                throw ValidationException::withMessages(["subject_teachers.{$i}.subject_id" => __('validation.exists', ['attribute' => 'subject'])]);
            }
        }
        BatchTeacher::where('batch_id', $batch->id)->delete();
        foreach (collect($rows)->unique(fn ($r) => "{$r['subject_id']}:{$r['teacher_id']}") as $r) {
            BatchTeacher::create(['batch_id' => $batch->id, 'teacher_id' => (int) $r['teacher_id'], 'subject_id' => (int) $r['subject_id']]);
        }
    }
}
