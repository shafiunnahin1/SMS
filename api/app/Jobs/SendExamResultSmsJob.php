<?php

namespace App\Jobs;

use App\Models\Exam;
use App\Services\Exams\ResultSmsService;
use App\Traits\TenantAwareJob;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

// D161 (2)(3): send an exam's pending / failed result and correction SMS (an empty wallet leaves the rest pending)
class SendExamResultSmsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, TenantAwareJob;

    public function __construct(public int $examId, public ?int $actorId, int $institutionId)
    {
        $this->institutionId = $institutionId;
    }

    public function handle(ResultSmsService $results): void
    {
        $exam = Exam::find($this->examId);
        if ($exam) $results->sendQueued($exam, $this->actorId);
    }
}
