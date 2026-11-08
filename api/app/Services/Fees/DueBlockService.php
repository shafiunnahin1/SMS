<?php

namespace App\Services\Fees;

use App\Models\{DueBlockExemption, Student};
use App\Services\{FeeService, InstitutionSettings};
use App\Support\{Money, Tenancy};

// D197 AAD.1 (academics-advanced.md section 2): the ONE place that decides whether dues hold back a student's admit card or result.
// Every endpoint and PDF asks isBlocked(); the frontend never computes it. Off unless the institution switched it on; an active
// exemption (scope or "all", not expired) lets the student through. The answer always carries the amount and the reason.
class DueBlockService
{
    public function __construct(private FeeService $fees, private InstitutionSettings $settings) {}

    /** @param 'admit_card'|'result' $scope  @return array{due_amount: string, months: int, reason: string}|null */
    public function isBlocked(Student $student, string $scope): ?array
    {
        $cfg = $this->settings->dueBlock(Tenancy::current());
        if (!$cfg[$scope === 'admit_card' ? 'block_admit_card' : 'block_result']) return null;
        if ($this->exempt($student, $scope)) return null;
        $lines = $this->fees->dueLines($student);
        $total = $lines->sum(fn ($l) => Money::toPaisa($l['amount']));
        if ($total <= 0) return null;
        $months = $lines->pluck('period')->filter(fn ($p) => preg_match('/^\d{4}-\d{2}$/', (string) $p))->unique()->count();
        $t = $cfg['block_threshold'];
        $hit = match ($t['mode']) {
            'any' => true,
            'months' => $months >= (int) $t['value'],
            default => $total >= Money::toPaisa($t['value']),
        };
        if (!$hit) return null;
        $amount = Money::format($total);
        return ['due_amount' => $amount, 'months' => $months, 'reason' => $cfg['block_message'] ?: __('errors.blocked_by_dues_default', ['amount' => $amount])];
    }

    public function exempt(Student $student, string $scope): bool
    {
        return DueBlockExemption::where('student_id', $student->id)->whereIn('scope', [$scope, 'all'])
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>=', now()->toDateString()))->exists();
    }
}
