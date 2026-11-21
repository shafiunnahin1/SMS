<?php

namespace App\Console\Commands;

use App\Http\Controllers\Visitor\VisitorLogController;
use App\Models\VisitorLog;
use App\Support\Tenancy;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

// D240 (6): a visitor's photo is personal data - deleted 90 days after the visit in every institution (module on or off); the entry stays
class PurgeVisitorPhotos extends Command
{
    protected $signature = 'visitors:purge-photos';
    protected $description = 'Delete visitor photos older than 90 days';

    public function handle(): int
    {
        $n = 0;
        Tenancy::each(function () use (&$n) {
            VisitorLog::whereNotNull('photo')->where('check_in', '<', now()->subDays(VisitorLogController::PHOTO_DAYS))->each(function ($v) use (&$n) {
                Storage::disk('private')->delete($v->photo);
                $v->forceFill(['photo' => null])->save();
                $n++;
            });
        });
        $this->info("purged {$n}");
        return self::SUCCESS;
    }
}
