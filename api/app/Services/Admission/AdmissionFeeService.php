<?php

namespace App\Services\Admission;

use App\Exceptions\BusinessException;
use App\Models\{AdmissionCycle, AdmissionLead, AuditLog, Institution, LeadPayment};
use App\Support\{Money, Tenancy};
use Illuminate\Support\Facades\DB;

// D209 ACY.2: the application fee. Each institution chooses its methods (settings.admission_fee_methods: cash and/or online;
// online is only a saved choice until a payment gateway exists). Cash is taken at the office while the cycle is open, the amount
// is the cycle's fee (never the client's), one APP- receipt each; a mistake is a negative reversal row with its own receipt.
class AdmissionFeeService
{
    public const DEFAULT_METHODS = ['cash'];

    public function methods(Institution $i): array
    {
        $m = array_values(array_intersect(LeadPayment::METHODS, (array) (($i->settings ?? [])['admission_fee_methods'] ?? self::DEFAULT_METHODS)));
        return $m ?: self::DEFAULT_METHODS;
    }

    /** paisa paid so far (payments minus reversals) */
    public function paidPaisa(AdmissionLead $lead): int
    {
        return LeadPayment::where('lead_id', $lead->id)->pluck('amount')->sum(fn ($a) => Money::toPaisa((string) $a));
    }

    public function isPaid(AdmissionLead $lead, AdmissionCycle $c): bool
    {
        $fee = Money::toPaisa((string) $c->application_fee);
        return $fee === 0 || $this->paidPaisa($lead) >= $fee;
    }

    public function collectCash(AdmissionLead $lead, int $by): LeadPayment
    {
        if (!in_array('cash', $this->methods(Tenancy::current()), true)) throw new BusinessException('cash is not accepted', 'fee_method_off', 422);
        return DB::transaction(function () use ($lead, $by) {
            [$lead, $c] = $this->lockedOpen($lead);
            $fee = Money::toPaisa((string) $c->application_fee);
            if ($fee === 0) throw new BusinessException('this cycle has no fee', 'no_application_fee', 422);
            if ($this->paidPaisa($lead) >= $fee) throw new BusinessException('already paid', 'fee_already_paid', 409);
            $p = LeadPayment::create(['lead_id' => $lead->id, 'method' => 'cash', 'received_by' => $by, 'amount' => Money::format($fee),
                'receipt_no' => $this->nextReceiptNo(), 'paid_at' => now()]);
            AuditLog::record('lead_payment.cash', $p, ['receipt_no' => $p->receipt_no]);
            return $p;
        });
    }

    public function reverse(LeadPayment $p, int $by, string $reason): LeadPayment
    {
        return DB::transaction(function () use ($p, $by, $reason) {
            [$lead] = $this->lockedOpen($p->lead);
            $p = LeadPayment::whereKey($p->id)->lockForUpdate()->firstOrFail();
            if (Money::toPaisa((string) $p->amount) <= 0) throw new BusinessException('a reversal cannot be reversed', 'payment_not_reversible', 422);
            if ($this->paidPaisa($lead) < Money::toPaisa((string) $p->amount)) throw new BusinessException('already reversed', 'payment_not_reversible', 422);
            $r = LeadPayment::create(['lead_id' => $lead->id, 'method' => $p->method, 'received_by' => $by, 'amount' => Money::format(-Money::toPaisa((string) $p->amount)),
                'receipt_no' => $this->nextReceiptNo(), 'paid_at' => now()]);
            AuditLog::record('lead_payment.reversed', $r, ['of' => $p->receipt_no, 'reason' => mb_substr($reason, 0, 200)]);
            return $r;
        });
    }

    /** APP-YYYY-00001, per institution, under the institution row lock */
    public function nextReceiptNo(): string
    {
        Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->value('id');
        $prefix = 'APP-' . now()->format('Y') . '-';
        $last = LeadPayment::where('receipt_no', 'like', $prefix . '%')->orderByDesc('receipt_no')->value('receipt_no');
        return $prefix . str_pad((string) ($last ? ((int) substr($last, -5)) + 1 : 1), 5, '0', STR_PAD_LEFT);
    }

    /** money moves only while the cycle takes applications (after the freeze the applicant list is fixed) */
    private function lockedOpen(AdmissionLead $lead): array
    {
        $lead = AdmissionLead::whereKey($lead->id)->lockForUpdate()->firstOrFail();
        $c = $lead->cycle_id ? AdmissionCycle::whereKey($lead->cycle_id)->lockForUpdate()->first() : null;
        if (!$c) throw new BusinessException('not an application of a cycle', 'lead_not_in_cycle', 422);
        if ($c->status !== 'open') throw new BusinessException('the cycle is not open', 'cycle_wrong_state', 422);
        return [$lead, $c];
    }
}
