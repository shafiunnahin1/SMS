<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Jobs\SendSmsJob;
use App\Models\{AuditLog, Expense, FeePayment, FeeRefund, Student, User};
use App\Support\{Money, Tenancy};
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class FeeRefundService
{
    private const FIELDS = ['student_id', 'request_key', 'original_receipt_no', 'amount', 'refund_lines',
        'reason', 'method', 'status', 'reversal_receipt_no', 'requested_by', 'approved_by', 'processed_by', 'processed_at'];

    private function actor(int $by): User
    {
        $user = User::whereKey($by)->where('institution_id', Tenancy::current()->id)->where('is_active', true)->first();
        if (!$user || !in_array($user->role, ['admin', 'accountant'], true)) throw new AuthorizationException();
        return $user;
    }

    private function invalid(string $key = 'refund_lines'): never
    {
        throw ValidationException::withMessages([$key => __('refund.invalid')]);
    }

    private function conflict(): never
    {
        throw new BusinessException(__('refund.conflict'), 'refund_conflict', 409);
    }

    public function find(int $id): FeeRefund
    {
        $root = FeeRefund::where('revision', 1)->findOrFail($id);
        return $root->setRelation('snapshots', FeeRefund::where('request_key', $root->request_key)->orderBy('revision')->get());
    }

    public function listing(array $filters)
    {
        $rows = FeeRefund::whereNotExists(function ($q) {
            $q->selectRaw('1')->from('fee_refunds as newer')
                ->whereColumn('newer.institution_id', 'fee_refunds.institution_id')
                ->whereColumn('newer.request_key', 'fee_refunds.request_key')
                ->whereColumn('newer.revision', '>', 'fee_refunds.revision');
        })->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['student_id'] ?? null, fn ($q, $v) => $q->where('student_id', $v))
            ->when($filters['receipt_no'] ?? null, fn ($q, $v) => $q->where('original_receipt_no', $v))
            ->orderByDesc('created_at')->orderByDesc('id')->paginate($filters['per_page'] ?? 25);
        $rows->through(fn ($snapshot) => $this->find(FeeRefund::where('request_key', $snapshot->request_key)->where('revision', 1)->value('id')));
        return $rows;
    }

    private function balance(FeePayment $line): int
    {
        return Money::toPaisa($line->paid_amount) + Money::toPaisa(FeePayment::where('reverses_id', $line->id)->sum('paid_amount'));
    }

    public function refundable(string $receipt): array
    {
        $rows = FeePayment::where('receipt_no', $receipt)->whereNull('reverses_id')->where('paid_amount', '>', 0)->get();
        abort_if($rows->isEmpty(), 404);
        return $rows->map(fn ($line) => ['fee_payment_id' => $line->id, 'student_id' => $line->student_id,
            'receipt_no' => $line->receipt_no, 'paid_amount' => $line->paid_amount,
            'refundable_amount' => Money::format($line->status === 'waived' || $line->online_payment_id ? 0 : max(0, $this->balance($line)))])->all();
    }

    private function canonical(array $data): array
    {
        $lines = collect($data['refund_lines'])->map(fn ($line) => ['fee_payment_id' => (int) $line['fee_payment_id'],
            'amount' => Money::format(Money::toPaisa($line['amount']))])->sortBy('fee_payment_id')->values()->all();
        if (count(array_unique(array_column($lines, 'fee_payment_id'))) !== count($lines)) $this->invalid();
        $total = array_sum(array_map(fn ($line) => Money::toPaisa($line['amount']), $lines));
        if ($total <= 0 || $total > 9999999999) $this->invalid();
        return ['request_key' => strtolower($data['request_key']), 'student_id' => (int) $data['student_id'],
            'original_receipt_no' => $data['original_receipt_no'], 'reason' => $data['reason'], 'method' => $data['method'],
            'refund_lines' => $lines, 'amount' => Money::format($total)];
    }

    /** Recheck under the shared institution lock at processing; pending requests reserve nothing. */
    private function validateLines(array $data): array
    {
        Student::findOrFail($data['student_id']);
        $rows = [];
        foreach ($data['refund_lines'] as $item) {
            $line = FeePayment::findOrFail($item['fee_payment_id']);
            if ($line->student_id !== $data['student_id'] || $line->receipt_no !== $data['original_receipt_no'] ||
                $line->reverses_id !== null || $line->status === 'waived' || $line->online_payment_id !== null ||
                Money::toPaisa($line->paid_amount) <= 0 || Money::toPaisa($item['amount']) <= 0 ||
                Money::toPaisa($item['amount']) > $this->balance($line)) $this->invalid();
            $rows[] = $line;
        }
        return $rows;
    }

    public function create(array $input, int $by): FeeRefund
    {
        return DB::transaction(function () use ($input, $by) {
            app(CashBookService::class)->lockInstitution();
            $this->actor($by);
            $data = $this->canonical($input);
            $existing = FeeRefund::where('request_key', $data['request_key'])->where('revision', 1)->first();
            if ($existing) {
                foreach ($data as $key => $value) if ($existing->$key !== $value) $this->conflict();
                return $this->find($existing->id);
            }
            $this->validateLines($data);
            $root = FeeRefund::create($data + ['revision' => 1, 'status' => 'requested', 'requested_by' => $by]);
            AuditLog::record('refund.requested', $root);
            return $this->find($root->id);
        });
    }

    public function transition(int $id, string $action, int $by): FeeRefund
    {
        return DB::transaction(function () use ($id, $action, $by) {
            $cashbook = app(CashBookService::class);
            $cashbook->lockInstitution();
            $actor = $this->actor($by);
            if (!in_array($action, ['approve', 'reject', 'process'], true)) abort(404);
            if ($action !== 'process' && $actor->role !== 'admin') throw new AuthorizationException();
            $root = $this->find($id);
            $latest = $root->snapshots->last();
            $state = ['approve' => 'approved', 'reject' => 'rejected', 'process' => 'processed'][$action];
            $prior = $root->snapshots->firstWhere('status', $state);
            if ($prior) {
                if ((int) ($action === 'process' ? $prior->processed_by : $prior->approved_by) !== $by) $this->conflict();
                return $root;
            }
            if ($latest->status !== ($action === 'process' ? 'approved' : 'requested')) $this->conflict();
            $exception = false;
            if ($action === 'approve' && (int) $root->requested_by === $by) {
                $exception = User::where('institution_id', Tenancy::current()->id)->where('role', 'admin')->where('is_active', true)->count() === 1;
                if (!$exception) throw new AuthorizationException();
            }
            $values = $latest->only(self::FIELDS);
            $values['status'] = $state;
            $values['revision'] = $latest->revision + 1;
            $expenseId = null;
            if ($action !== 'process') $values['approved_by'] = $by;
            else {
                $time = now();
                $cashbook->assertCashWrite($time->toDateString(), $latest->method);
                $lines = $this->validateLines($values);
                $prefix = 'RFD-' . $time->format('Y') . '-';
                $last = FeePayment::where('receipt_no', 'like', $prefix . '%')->orderByDesc('id')->value('receipt_no');
                $receipt = $prefix . str_pad((string) ($last ? ((int) substr($last, strrpos($last, '-') + 1)) + 1 : 1), 5, '0', STR_PAD_LEFT);
                foreach ($lines as $n => $line) {
                    FeePayment::create($line->only(['student_id', 'enrollment_id', 'batch_id', 'fee_category_id', 'amount', 'discount', 'month']) +
                        ['paid_amount' => Money::format(-Money::toPaisa($values['refund_lines'][$n]['amount'])),
                         'payment_method' => $latest->method, 'receipt_no' => $receipt, 'line_no' => $n + 1,
                         'paid_at' => $time, 'collected_by' => $by, 'status' => 'reversed', 'reverses_id' => $line->id]);
                }
                $expenseId = Expense::create(['category' => 'fee_refund', 'title' => __('refund.expense_title'), 'amount' => $latest->amount,
                    'expense_date' => $time->toDateString(), 'payment_method' => $latest->method, 'source' => 'refund', 'added_by' => $by,
                    'note' => $receipt . ' / refund #' . $root->id])->id;
                $values['reversal_receipt_no'] = $receipt;
                $values['processed_by'] = $by;
                $values['processed_at'] = $time;
            }
            $snapshot = FeeRefund::create($values);
            AuditLog::record('refund.' . $state, $snapshot, ['request_id' => $root->id, 'revision' => $snapshot->revision,
                'self_approval_exception' => $exception, 'expense_id' => $expenseId]);
            if ($action === 'process') {
                $student = Student::findOrFail($root->student_id);
                $locale = app(SmsService::class)->localeFor($student->primaryParent(), Tenancy::current());
                SendSmsJob::dispatch($student->guardian_phone, __('refund.sms', ['amount' => $snapshot->amount,
                    'receipt' => $snapshot->reversal_receipt_no], $locale), Tenancy::current()->id, $by, transactional: true)->afterCommit();
            }
            return $this->find($id);
        });
    }
}
