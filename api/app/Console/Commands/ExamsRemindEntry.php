<?php

namespace App\Console\Commands;

use App\Models\{BatchTeacher, Exam, ExamMarkSubmission, ExamSubject, Teacher, User};
use App\Services\{ModuleGate, NotificationService, SmsService};
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D197 AAD.6 (academics-advanced.md section 6): daily, two days before a subject's marks entry deadline and on the day, the
// teachers whose marks are still a draft (not submitted) get an in-app note and an SMS by their own notification preferences.
// One institution at a time (Tenancy::each); an institution without the exams module or a published exam is skipped.
class ExamsRemindEntry extends Command
{
    protected $signature = 'exams:remind-entry';
    protected $description = 'Remind teachers of marks still due two days before and on the entry deadline';

    public function handle(NotificationService $notify, ModuleGate $modules, SmsService $sms): int
    {
        $sent = 0;
        $days = [now()->toDateString(), now()->addDays(2)->toDateString()];
        Tenancy::each(function ($institution) use ($notify, $modules, $sms, $days, &$sent) {
            if (!$modules->allows($institution, 'exams')) return;
            $due = ExamSubject::with(['exam:id,name,status,batch_id', 'subject:id,name,teacher_id'])
                ->where(fn ($q) => $q->whereDate('entry_deadline', $days[0])->orWhereDate('entry_deadline', $days[1]))
                ->whereHas('exam', fn ($q) => $q->where('status', '!=', 'published'))->get();
            $submitted = ExamMarkSubmission::whereIn('exam_subject_id', $due->pluck('id'))->where('status', '!=', 'draft')->pluck('exam_subject_id')->flip();
            foreach ($due as $es) {
                if ($submitted->has($es->id)) continue;
                $teacherIds = array_filter(array_merge([$es->subject?->teacher_id], BatchTeacher::where('subject_id', $es->subject_id)
                    ->when($es->exam?->batch_id, fn ($q) => $q->where('batch_id', $es->exam->batch_id))->pluck('teacher_id')->all()));
                $users = User::whereIn('id', Teacher::whereIn('id', array_unique($teacherIds))->whereNotNull('user_id')->pluck('user_id'))->where('is_active', true)->get();
                $today = $es->entry_deadline->toDateString() === $days[0];
                foreach ($users as $u) {
                    $loc = $sms->localeFor($u, $institution);
                    $vars = ['exam' => $es->exam?->name, 'subject' => $es->subject?->name, 'deadline' => $es->entry_deadline->format('d/m/Y H:i')];
                    $notify->notify($u, 'marks_reminder', __('exams.reminder.title', [], $loc), __($today ? 'exams.reminder.today' : 'exams.reminder.soon', $vars, $loc),
                        ['exam_id' => $es->exam_id, 'subject_id' => $es->subject_id]);
                    $sent++;
                }
            }
        });
        $this->info("marks entry reminders: {$sent}");
        return self::SUCCESS;
    }
}
