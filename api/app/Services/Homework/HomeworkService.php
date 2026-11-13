<?php

namespace App\Services\Homework;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, BatchTeacher, Homework, Student, Subject, Teacher, User};
use App\Notifications\GeneralNotification;
use App\Services\Sms\SmsEventPolicy;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\{DB, Storage};
use Illuminate\Support\Str;

// D212 HW.1: a teacher gives homework for a subject they teach (the subject's teacher, or a batch-teacher row of that subject), the
// admin for any; the target's students and their parents get an in-app notification, and each guardian phone the D208 SMS event
// `homework_new` (off / auto / manual). The optional file is kept on the private disk.
class HomeworkService
{
    public function teaches(Teacher $t, Subject $s, ?int $batchId): bool
    {
        if ((int) $s->teacher_id === $t->id) return true;
        return BatchTeacher::where('teacher_id', $t->id)->where('subject_id', $s->id)->when($batchId, fn ($q) => $q->where('batch_id', $batchId))->exists();
    }

    public function create(array $d, Teacher $teacher, User $by, ?UploadedFile $file): Homework
    {
        return DB::transaction(function () use ($d, $teacher, $by, $file) {
            $hw = Homework::create(array_intersect_key($d, array_flip(['program_id', 'batch_id', 'subject_id', 'title', 'description', 'due_date'])) + ['teacher_id' => $teacher->id]);
            if ($file) $hw->update(['file_path' => $this->store($file)]);
            AuditLog::record('homework.created', $hw, ['subject_id' => $hw->subject_id]);
            $this->announce($hw);
            return $hw;
        });
    }

    public function update(Homework $hw, array $d, ?UploadedFile $file): Homework
    {
        $hw->update(array_intersect_key($d, array_flip(['title', 'description', 'due_date'])));
        if ($file) {
            $old = $hw->file_path;
            $hw->update(['file_path' => $this->store($file)]);
            if ($old) Storage::disk('private')->delete($old);
        }
        AuditLog::record('homework.updated', $hw);
        return $hw;
    }

    /** in-app to the students and their parents; one SMS per guardian phone (the D208 event decides) */
    private function announce(Homework $hw): void
    {
        $hw->loadMissing('subject:id,name');
        $title = __('homework.new_title');
        $body = __('homework.new_body', ['subject' => $hw->subject?->name, 'title' => $hw->title, 'date' => $hw->due_date?->format('d/m/Y') ?? '-']);
        $phones = [];
        $users = [];   // one notice per person, even a parent of two children in the target
        foreach ($hw->audience()->with(['user', 'parents'])->get() as $s) {
            foreach (array_filter([$s->user, ...$s->parents]) as $u) $users[$u->id] = $u;
            if ($s->guardian_phone) $phones[$s->guardian_phone] = true;
        }
        foreach ($users as $u) $u->notify(new GeneralNotification($title, $body, 'homework_new', ['homework_id' => $hw->id]));
        $policy = app(SmsEventPolicy::class);
        if ($policy->mode('homework_new') === 'off') return;
        $sms = __('homework.sms', ['subject' => $hw->subject?->name, 'title' => Str::limit($hw->title, 60), 'date' => $hw->due_date?->format('d/m/Y') ?? '-']);
        foreach (array_keys($phones) as $phone) $policy->dispatch('homework_new', $phone, $sms);
    }

    private function store(UploadedFile $f): string
    {
        $path = $f->storeAs('institutions/' . \App\Support\Tenancy::current()->id . '/homework', Str::uuid() . '.' . $f->extension(), 'private');
        if (!$path) throw new BusinessException('the file could not be saved', 'upload_failed', 422);
        return $path;
    }
}
