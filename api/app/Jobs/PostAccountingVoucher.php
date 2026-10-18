<?php

namespace App\Jobs;

use App\Exceptions\BusinessException;
use App\Services\Accounting\AccountingPostingService;
use App\Traits\TenantAwareJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

// accounting.md §3: the listener's work, inside the source's institution (D25). A source that cannot post now (locked period,
// unmapped tax) is not lost: it stays in the "unposted" report until repost().
class PostAccountingVoucher implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public int $tries = 3;

    public function __construct(public string $source, public int $sourceId, int $institutionId)
    {
        $this->institutionId = $institutionId;
    }

    public function handle(AccountingPostingService $posting): void
    {
        try { $posting->post($this->source, $this->sourceId); }
        catch (BusinessException) { /* left for the unposted report */ }
    }
}
