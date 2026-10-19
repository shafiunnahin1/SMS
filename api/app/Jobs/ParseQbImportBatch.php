<?php

namespace App\Jobs;

use App\Models\QbImportBatch;
use App\Services\QbImportService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

// D123 (R2.1.3): read an import's files once, count the questions and queue the chunks (platform rows - no institution)
class ParseQbImportBatch implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 3;
    public int $timeout = 600;

    public function __construct(public int $batchId) {}

    public function handle(QbImportService $imports): void
    {
        $imports->plan(QbImportBatch::findOrFail($this->batchId));
    }
}
