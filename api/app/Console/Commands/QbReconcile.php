<?php

namespace App\Console\Commands;

use App\Services\QuestionBank\QbReconcileService;
use Illuminate\Console\Command;

// D191 R2.1.8: read-only check of the question bank's money (student orders -> grants, writer earnings -> sales, wallets -> ledger).
// Prints codes, institution ids and row ids only; exits 1 when anything does not add up.
class QbReconcile extends Command
{
    protected $signature = 'qb:reconcile';
    protected $description = 'Check (read-only) that question-bank orders, grants, writer earnings and wallets add up exactly';

    public function handle(QbReconcileService $service): int
    {
        $issues = $service->run();
        foreach ($issues as $i) $this->line(json_encode($i, JSON_UNESCAPED_SLASHES));
        if ($issues) { $this->error(count($issues) . ' mismatch(es)'); return self::FAILURE; }
        $this->info('question-bank money reconciles: 0 mismatches');
        return self::SUCCESS;
    }
}
