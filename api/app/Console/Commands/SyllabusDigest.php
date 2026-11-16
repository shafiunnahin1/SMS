<?php

namespace App\Console\Commands;

use App\Models\{Institution, User};
use App\Notifications\GeneralNotification;
use App\Services\ModuleGate;
use App\Services\Syllabus\SyllabusService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// D224 (3) syllabus:digest - every Saturday 08:00 Asia/Dhaka (routes/console.php): each institution with the syllabus module gets
// one in-app note to its admins - how many planned lessons are behind and for how many teachers. No names, no ranking, no penalty.
class SyllabusDigest extends Command
{
    protected $signature = 'syllabus:digest';
    protected $description = 'Weekly in-app syllabus summary to the admins (lessons behind their plan)';

    public function handle(SyllabusService $syllabus, ModuleGate $gate): int
    {
        Tenancy::each(function (Institution $i) use ($syllabus, $gate) {
            if (!$gate->allows($i, 'syllabus')) return;
            $behind = $syllabus->behind(null);
            if ($behind->isEmpty()) return;
            $body = __('syllabus.digest_body', ['lessons' => $behind->count(), 'teachers' => $behind->pluck('teacher_id')->unique()->count()]);
            User::inTenant()->where('role', 'admin')->where('is_active', true)->get()
                ->each(fn (User $u) => $u->notify(new GeneralNotification(__('syllabus.digest_title'), $body, 'syllabus_digest', ['behind' => $behind->count()])));
        });
        return self::SUCCESS;
    }
}
