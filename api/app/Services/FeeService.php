<?php

namespace App\Services;

use App\Jobs\SendSmsJob;
use App\Exceptions\BusinessException;
use App\Models\{Batch, Enrollment, FeeCategory, FeePayment, FeeStructure, Institution, Student};
use App\Support\Money;
use App\Support\Tenancy;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// docs/templates/laravel-core-files.md "FeeService" - Release 1 part. A due = enrollment x fee category x period
// (YYYY-MM monthly, YYYY yearly, `once`); its key "{enrollment_id}:{fee_category_id}:{period}" is what the counter collects.
// Not in R1: waivers / sibling discount (fees-advanced), online payment, platform-mode fees - discountFor() is their hook.
// Amounts are decimal strings computed in paisa (G9).
class FeeService
{
    /** Amount for one enrollment x category; null = the category does not apply.
     *  Order: fee_override (monthly only) > batch.monthly_fee (monthly only) > fee_structures(batch) > fee_structures(program) > category.amount */
    public function resolveAmount(Enrollment $e, FeeCategory $c): ?string
    {
        $isTuition = $c->frequency === 'monthly';
        // fee_structures rows are per academic year (0 = any year): the enrollment's year beats the year-less row
        $year = (int) ($e->academic_year_id ?? 0);
        $byYear = fn ($q) => $q->whereIn('academic_year_id', array_unique([$year, 0]))->orderByDesc('academic_year_id');

        $amount = ($isTuition ? $e->fee_override : null)
            ?? ($isTuition ? $e->batch->monthly_fee : null)
            ?? $byYear(FeeStructure::where('batch_id', $e->batch_id)->where('fee_category_id', $c->id))->value('amount')
            ?? $byYear(FeeStructure::where('batch_id', 0)->where('program_id', $e->program_id)->where('fee_category_id', $c->id))->value('amount');

        if ($amount === null) {
            if ($c->applicable_to === 'program_specific') return null;      // needs an explicit fee_structures row
            $amount = $c->amount;
        }
        return Money::toPaisa($amount) > 0 ? Money::format(Money::toPaisa($amount)) : null;
    }

    /** Monthly tuition of an enrollment (the institution's first monthly category) */
    public function resolveMonthlyAmount(Enrollment $e): ?string
    {
        $tuition = FeeCategory::where('frequency', 'monthly')->orderBy('id')->first();
        return $tuition ? $this->resolveAmount($e, $tuition) : null;
    }

    /** Release 1 grants no automatic discount; waivers and sibling discount plug in here with their release */
    public function discountFor(Student $s, FeeCategory $c, string $gross): string
    {
        return '0.00';
    }

    /** Monthly: from the enrollment month (at most 12 months back) to now */
    private function periodsFor(FeeCategory $c, Enrollment $e): array
    {
        return match ($c->frequency) {
            'once'   => ['once'],
            'yearly' => [now()->format('Y')],
            default  => collect(range(0, 11))
                ->map(fn ($i) => now()->subMonthsNoOverflow($i)->startOfMonth())
                ->filter(fn ($m) => $m->gte($e->enrolled_at->copy()->startOfMonth()))
                ->map(fn ($m) => $m->format('Y-m'))->sort()->values()->all(),
        };
    }

    /** Every unpaid due of a student across ALL active enrollments (a coaching student in two batches has two tuition dues) */
    public function dueLines(Student $s): Collection
    {
        $categories = FeeCategory::orderBy('id')->get();
        $prorate = ((Tenancy::current()->settings ?? [])['fee_proration'] ?? 'none') === 'half_after_15';
        $lines = collect();

        foreach ($s->activeEnrollments()->with(['batch', 'program'])->orderBy('id')->get() as $e) {
            foreach ($categories as $c) {
                $gross = $this->resolveAmount($e, $c);
                if ($gross === null) continue;
                foreach ($this->periodsFor($c, $e) as $period) {
                    $paid = FeePayment::where('enrollment_id', $e->id)->where('fee_category_id', $c->id)->where('month', $period)->get();
                    if ($paid->where('status', 'waived')->isNotEmpty()) continue;
                    // settled by the NET paid amount: reversal lines carry a negative paid_amount (D32)
                    $g = Money::toPaisa($gross);
                    if ($prorate && $c->frequency === 'monthly' && $period === $e->enrolled_at->format('Y-m') && $e->enrolled_at->day > 15) {
                        $g = Money::ratio($g, 1, 2);
                    }
                    $disc = Money::toPaisa($this->discountFor($s, $c, Money::format($g)));
                    $payable = $g - $disc - $paid->sum(fn ($p) => Money::toPaisa($p->paid_amount));
                    if ($payable <= 0) continue;

                    $lines->push([
                        'key' => "{$e->id}:{$c->id}:{$period}", 'enrollment_id' => $e->id, 'batch_id' => $e->batch_id,
                        'fee_category_id' => $c->id, 'category' => $c->name, 'period' => $period,
                        'gross' => Money::format($g), 'discount' => Money::format($disc), 'amount' => Money::format($payable),
                    ]);
                }
            }
        }
        return $lines;
    }

    /** Counter collection: several dues -> ONE receipt. $lines = [['key' => ..., 'paid_amount' => ? (<= due)], ...] */
    public function collect(Student $s, array $lines, string $method = 'cash'): Collection
    {
        return DB::transaction(function () use ($s, $lines, $method) {
            $dues = $this->dueLines($s)->keyBy('key');
            $receipt = $this->nextReceiptNo();
            $n = 0;
            $rows = collect($lines)->map(function ($l) use ($s, $dues, $method, $receipt, &$n) {
                if (!$dues->has($l['key'] ?? '')) throw ValidationException::withMessages(['lines' => __('errors.due_not_applicable')]);
                $d = $dues[$l['key']];
                $due = Money::toPaisa($d['amount']);
                $paid = min(Money::toPaisa($l['paid_amount'] ?? $d['amount']), $due);
                if ($paid <= 0) throw ValidationException::withMessages(['lines' => __('errors.amount_positive')]);
                return FeePayment::create([
                    'student_id' => $s->id, 'enrollment_id' => $d['enrollment_id'], 'batch_id' => $d['batch_id'],
                    'fee_category_id' => $d['fee_category_id'], 'amount' => $d['gross'], 'discount' => $d['discount'],
                    'paid_amount' => Money::format($paid), 'month' => $d['period'], 'payment_method' => $method,
                    'receipt_no' => $receipt, 'line_no' => ++$n, 'paid_at' => now(), 'collected_by' => auth()->id(),
                    'status' => $paid >= $due ? 'paid' : 'partial',
                ]);
            });
            $total = Money::format($rows->sum(fn ($r) => Money::toPaisa($r->paid_amount)));
            // sender + institution suffix are added by SmsService::compose()
            $locale = app(SmsService::class)->localeFor($s->primaryParent(), Tenancy::current());
            SendSmsJob::dispatch($s->guardian_phone, __('sms.fee_received', ['amount' => $total, 'receipt' => $receipt], $locale), Tenancy::current()->id, auth()->id(), transactional: true)->afterCommit();
            return $rows;
        });
    }

    /** Create or update a fee category. Once money was collected under it, its frequency is fixed (the periods of paid dues
     *  would change meaning); the amount may change - it applies to dues not yet paid. */
    public function saveCategory(array $data, ?FeeCategory $c = null): FeeCategory
    {
        $data['applicable_to'] = $data['applicable_to'] ?? 'all';
        if ($c && $c->frequency !== $data['frequency'] && $c->payments()->exists()) {
            throw new BusinessException('frequency is fixed once collected', 'in_use', 422);
        }
        $c ??= new FeeCategory();
        $c->fill($data)->save();
        return $c;
    }

    /** Receipts (one row per receipt_no) newest first; filters: from, to (dates), payment_method, student_id */
    public function receipts(array $f, int $perPage = 20)
    {
        return FeePayment::query()
            ->selectRaw('receipt_no, MIN(id) AS id, student_id, payment_method, MAX(paid_at) AS paid_at, SUM(paid_amount) AS total, COUNT(*) AS line_count')
            ->when($f['from'] ?? null, fn ($q, $d) => $q->where('paid_at', '>=', $d . ' 00:00:00'))
            ->when($f['to'] ?? null, fn ($q, $d) => $q->where('paid_at', '<=', $d . ' 23:59:59'))
            ->when($f['payment_method'] ?? null, fn ($q, $m) => $q->where('payment_method', $m))
            ->when($f['student_id'] ?? null, fn ($q, $s) => $q->where('student_id', $s))
            ->groupBy('receipt_no', 'student_id', 'payment_method')
            ->orderByDesc('paid_at')->orderByDesc('receipt_no')
            ->with('student.user:id,name')
            ->paginate($perPage);
    }

    /** Money collected in a month (by paid_at): total, receipts, per category, per method, per day. Optional program / category filter. */
    public function monthlyReport(string $month, ?int $programId = null, ?int $categoryId = null): array
    {
        $from = $month . '-01 00:00:00';
        $to = date('Y-m-t 23:59:59', strtotime($month . '-01'));
        $base = fn () => FeePayment::query()->whereBetween('paid_at', [$from, $to])
            ->when($programId, fn ($q) => $q->whereIn('batch_id', Batch::where('program_id', $programId)->select('id')))
            ->when($categoryId, fn ($q) => $q->where('fee_category_id', $categoryId));
        $fmt = fn ($v) => Money::format(Money::toPaisa($v ?? 0));
        $names = FeeCategory::pluck('name', 'id');

        return [
            'month' => $month,
            'total' => $fmt($base()->sum('paid_amount')),
            'receipts' => $base()->distinct()->count('receipt_no'),
            'by_category' => $base()->selectRaw('fee_category_id, SUM(paid_amount) AS total')->groupBy('fee_category_id')->get()
                ->map(fn ($r) => ['id' => $r->fee_category_id, 'name' => $names[$r->fee_category_id] ?? null, 'total' => $fmt($r->total)])->sortByDesc(fn ($r) => Money::toPaisa($r['total']))->values(),
            'by_method' => $base()->selectRaw('payment_method, SUM(paid_amount) AS total')->groupBy('payment_method')->get()
                ->map(fn ($r) => ['method' => $r->payment_method, 'total' => $fmt($r->total)])->values(),
            'by_day' => $base()->selectRaw('DATE(paid_at) AS day, SUM(paid_amount) AS total')->groupBy('day')->orderBy('day')->get()
                ->map(fn ($r) => ['date' => $r->day, 'total' => $fmt($r->total)])->values(),
        ];
    }

    /** Must run inside a transaction: the institution row lock serialises numbering per institution */
    public function nextReceiptNo(): string
    {
        Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->value('id');
        $prefix = 'RCP-' . date('Y') . '-';
        $last = FeePayment::where('receipt_no', 'like', $prefix . '%')->orderByDesc('receipt_no')->value('receipt_no');
        return $prefix . str_pad((string) ($last ? ((int) substr($last, -5)) + 1 : 1), 5, '0', STR_PAD_LEFT);
    }
}
