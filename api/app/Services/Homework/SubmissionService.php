<?php

namespace App\Services\Homework;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Homework, HomeworkSubmission, Student};
use App\Notifications\GeneralNotification;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;

// D212 HW.2: one submission per student and homework. Online: text and / or one file; after the due date's end it is `late`;
// re-submitting replaces it until graded. On paper: the teacher marks it (no file). Grading: a free short grade and feedback; the
// student (and their parents) get an in-app notice.
class SubmissionService
{
    public function submit(Homework $hw, Student $s, ?string $text, ?UploadedFile $file): HomeworkSubmission
    {
        if (!$text && !$file) throw new BusinessException('nothing to submit', 'empty_submission', 422);
        return DB::transaction(function () use ($hw, $s, $text, $file) {
            $sub = $this->locked($hw, $s);
            if ($sub?->status === 'graded') throw new BusinessException('already graded', 'submission_graded', 422);
            $path = $file ? $file->storeAs('institutions/' . \App\Support\Tenancy::current()->id . '/homework/submissions', Str::uuid() . '.' . $file->extension(), 'private') : null;
            if ($file && !$path) throw new BusinessException('the file could not be saved', 'upload_failed', 422);
            $old = $sub?->file_path;
            $sub = HomeworkSubmission::updateOrCreate(['homework_id' => $hw->id, 'student_id' => $s->id],
                ['text_answer' => $text, 'file_path' => $path ?? ($text ? null : $old), 'submitted_at' => now(), 'status' => $this->late($hw) ? 'late' : 'submitted']);
            if ($old && $old !== $sub->file_path) Storage::disk('private')->delete($old);
            AuditLog::record('homework.submitted', $sub, ['homework_id' => $hw->id]);
            return $sub;
        });
    }

    /** the teacher marks a student as having handed it in on paper */
    public function markPaper(Homework $hw, Student $s): HomeworkSubmission
    {
        return DB::transaction(function () use ($hw, $s) {
            $sub = $this->locked($hw, $s);
            if ($sub) return $sub;   // already in (online or paper)
            $sub = HomeworkSubmission::create(['homework_id' => $hw->id, 'student_id' => $s->id, 'submitted_at' => now(), 'status' => $this->late($hw) ? 'late' : 'submitted']);
            AuditLog::record('homework.paper_marked', $sub, ['homework_id' => $hw->id]);
            return $sub;
        });
    }

    public function grade(HomeworkSubmission $sub, ?string $grade, ?string $feedback): HomeworkSubmission
    {
        return DB::transaction(function () use ($sub, $grade, $feedback) {
            $sub = HomeworkSubmission::whereKey($sub->id)->lockForUpdate()->firstOrFail();
            $sub->update(['grade' => $grade, 'teacher_feedback' => $feedback, 'feedback_at' => now(), 'status' => 'graded']);
            AuditLog::record('homework.graded', $sub);
            $s = Student::with(['user', 'parents'])->find($sub->student_id);
            $hw = Homework::with('subject:id,name')->find($sub->homework_id);
            $users = [];
            foreach (array_filter([$s?->user, ...($s?->parents ?? [])]) as $u) $users[$u->id] = $u;
            foreach ($users as $u) $u->notify(new GeneralNotification(__('homework.graded_title'), __('homework.graded_body', ['title' => $hw?->title, 'grade' => $grade ?? '-']), 'homework_graded', ['homework_id' => $sub->homework_id]));
            return $sub;
        });
    }

    private function locked(Homework $hw, Student $s): ?HomeworkSubmission
    {
        return HomeworkSubmission::where('homework_id', $hw->id)->where('student_id', $s->id)->lockForUpdate()->first();
    }

    private function late(Homework $hw): bool
    {
        return $hw->due_date !== null && now()->gt($hw->due_date->copy()->endOfDay());
    }
}
