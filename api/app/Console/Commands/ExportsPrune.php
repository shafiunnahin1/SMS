<?php

namespace App\Console\Commands;

use App\Models\TenantExport;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

// D193 EXP.1 (platform-ops.md section 5.2): an export or backup file past its time is deleted and the row marked expired. Runs over
// every institution (anyInstitution; file path and status only).
class ExportsPrune extends Command
{
    protected $signature = 'exports:prune';
    protected $description = 'Delete expired institution export and backup files';

    public function handle(): int
    {
        $n = 0;
        foreach (TenantExport::anyInstitution()->where('status', 'ready')->where('expires_at', '<=', now())->get() as $e) {
            if ($e->file_path) Storage::disk('private')->delete($e->file_path);
            $e->forceFill(['status' => 'expired', 'file_path' => null])->save();
            $n++;
        }
        $this->info("exports expired: {$n}");
        return self::SUCCESS;
    }
}
