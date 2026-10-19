<?php

namespace App\Jobs;

use App\Models\QbImportBatch;
use App\Services\QbImportService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

// D123 (R2.1.3): stage one chunk of an import; retried safely - a record already staged is skipped, never doubled
class ParseQbImportChunk implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 3;
    public int $timeout = 600;

    public function __construct(public int $batchId, public int $fileIndex, public int $offset) {}

    public function handle(QbImportService $imports): void
    {
        $imports->parseChunk(QbImportBatch::findOrFail($this->batchId), $this->fileIndex, $this->offset);
    }
}
