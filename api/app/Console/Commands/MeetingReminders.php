<?php

namespace App\Console\Commands;

use App\Models\ParentMeeting;
use App\Notifications\GeneralNotification;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D235 MTG.1: the evening before, an in-app reminder to the parents and the teacher of each open meeting tomorrow (no SMS)
class MeetingReminders extends Command
{
    protected $signature = 'meetings:remind';
    protected $description = 'In-app reminders for tomorrow\'s parent meetings';

    public function handle(): int
    {
        $n = 0;
        Tenancy::each(function ($i) use (&$n) {
            if (!app(\App\Services\ModuleGate::class)->allows($i, 'parent_meeting')) return;
            $tomorrow = now()->addDay()->toDateString();
            foreach (ParentMeeting::with(['student.parents', 'student.user:id,name', 'teacher.user'])->whereIn('status', ['pending', 'confirmed'])->where('proposed_date', $tomorrow)->get() as $m) {
                $body = __('meeting.reminder_body', ['subject' => $m->subject, 'student' => $m->student?->user?->name ?? '', 'time' => substr($m->proposed_time, 0, 5)]);
                $users = $m->student?->parents ?? collect();
                if ($m->teacher?->user) $users = $users->push($m->teacher->user);
                $users->each(fn ($u) => $u->notify(new GeneralNotification(__('meeting.reminder_title'), $body, 'meeting_reminder', ['meeting_id' => $m->id])));
                $n++;
            }
        });
        $this->info("reminded {$n}");
        return self::SUCCESS;
    }
}
