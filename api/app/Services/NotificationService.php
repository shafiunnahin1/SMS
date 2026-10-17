<?php

namespace App\Services;

use App\Jobs\SendSmsJob;
use App\Models\{Student, User};
use App\Notifications\GeneralNotification;
use App\Support\Tenancy;

// In-app + SMS, honouring the user's preferences (docs/templates/laravel-core-files.md "NotificationService").
// WhatsApp and mobile push are later releases (push / mobile app: R7).
class NotificationService
{
    public function notify(User $user, string $type, string $title, string $body, array $data = []): void
    {
        $prefs = $user->notification_preferences ?? [];

        $user->notify(new GeneralNotification($title, $body, $type, $data));          // in-app: always

        if (($prefs['sms'] ?? true) && ($prefs[$type] ?? true) && $user->phone) {
            SendSmsJob::dispatch($user->phone, $body, Tenancy::current()->id)->afterCommit();
        }
    }

    /** The primary parent of each student; `{name}` in the body becomes the student's name. Returns how many were notified. */
    public function notifyStudentsParents(array $studentIds, string $type, string $title, string $body): int
    {
        $sent = 0;
        foreach (Student::with('user')->whereIn('id', $studentIds)->get() as $student) {
            $parent = $student->primaryParent();
            if (!$parent) continue;
            $this->notify($parent, $type, $title, str_replace('{name}', $student->user?->name ?? $student->student_id, $body));
            $sent++;
        }
        return $sent;
    }
}
