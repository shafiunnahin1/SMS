<?php

namespace App\Console\Commands;

use App\Models\{AiAttachment, Institution};
use App\Support\Tenancy;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/** D166 (5) AI-Q5: chat photos older than one day are deleted - the file and its row - in every institution */
class AiAttachmentsPurge extends Command
{
    protected $signature = 'ai:attachments-purge';
    protected $description = 'Delete AI chat photos past their one-day keep';

    public function handle(): int
    {
        $gone = 0;
        foreach (Institution::cursor() as $institution) Tenancy::as($institution, function () use (&$gone) {   // every status: a suspended school's photos go too
            AiAttachment::where('expires_at', '<=', now())->chunkById(200, function ($rows) use (&$gone) {
                foreach ($rows as $a) { Storage::disk('private')->delete($a->path); $a->delete(); $gone++; }
            });
        });
        $this->line("deleted {$gone}");
        return self::SUCCESS;
    }
}
