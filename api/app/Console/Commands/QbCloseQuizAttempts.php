<?php

namespace App\Console\Commands;

use App\Models\QbQuizAttempt;
use App\Services\QbQuizService;
use App\Support\Tenancy;
use Illuminate\Console\Command;

// QB.10 (docs/modules/question-bank.md §3ছ "সময় শেষ হলে server নিজে জমা নেয়"): every institution's quiz attempts past their deadline
// (+ grace) are submitted with the answers saved so far and marked - for students who closed the page and never came back.
class QbCloseQuizAttempts extends Command
{
    protected $signature = 'qb:close-quiz-attempts';
    protected $description = 'Submit and mark quiz attempts whose time is over';

    public function handle(QbQuizService $quizzes): int
    {
        $n = 0;
        Tenancy::each(function () use ($quizzes, &$n) {
            QbQuizAttempt::whereNull('submitted_at')->where('started_at', '<', now()->subMinute())->orderBy('id')
                ->chunkById(200, function ($rows) use ($quizzes, &$n) { $n += $quizzes->closeOverdue($rows); });
        });
        $this->info("quiz attempts closed: {$n}");
        return self::SUCCESS;
    }
}
