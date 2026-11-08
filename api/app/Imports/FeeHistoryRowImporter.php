<?php

namespace App\Imports;

use App\Models\FeePayment;
use Illuminate\Support\Facades\Validator;

// D193 MIG.1 kind=fee_history (data-migration.md section 3): old receipts become fee_payments lines numbered `LEG-<old receipt no>`
// (no clash with the live sequence); several rows of one old receipt are its lines 1..n in file order. Written directly - no SMS,
// no cash-book entry, no voucher (the accounting scan skips lines before its start date). D32: imported money is never deleted,
// so a rollback keeps these lines (owner, 2026-11-07).
final class FeeHistoryRowImporter extends RowImporter
{
    private array $lines = [];

    public function __construct(private Lookup $find) {}

    public function fields(): array { return ['student_id', 'fee_category', 'amount', 'paid_at', 'receipt_no', 'month', 'payment_method']; }
    public function required(): array { return ['student_id', 'fee_category', 'amount', 'paid_at', 'receipt_no']; }
    public function aliases(): array { return ['student' => 'student_id', 'student_code' => 'student_id', 'category' => 'fee_category', 'fee' => 'fee_category', 'date' => 'paid_at', 'receipt' => 'receipt_no', 'method' => 'payment_method'] ; }

    public function check(array $data): array
    {
        $v = Validator::make($data, ['student_id' => 'required|string', 'fee_category' => 'required|string', 'amount' => ['required', 'regex:/^\d{1,8}(\.\d{1,2})?$/'],
            'paid_at' => 'required|date|before_or_equal:today', 'receipt_no' => 'required|string|max:46', 'month' => ['nullable', 'regex:/^\d{4}-\d{2}$/'],
            'payment_method' => 'nullable|in:cash,bkash,nagad,card,bank_transfer,cheque']);
        if ($v->fails()) return $this->result('error', $v->errors()->first(), $data);
        $student = $this->find->student($data['student_id']);
        if (!$student) return $this->result('error', __('errors.import_unknown', ['field' => 'student_id', 'value' => $data['student_id']]), $data);
        $cat = $this->find->category($data['fee_category']);
        if (!$cat) return $this->result('error', __('errors.import_unknown', ['field' => 'fee_category', 'value' => $data['fee_category']]), $data);
        $receipt = 'LEG-' . trim($data['receipt_no']);
        $line = $this->lines[$receipt] = ($this->lines[$receipt] ?? 0) + 1;
        if ($line > 255) return $this->result('error', __('errors.import_too_many_lines'), $data);
        if (FeePayment::where('receipt_no', $receipt)->where('line_no', $line)->exists()) return $this->result('skipped', __('errors.import_exists'), $data);
        $enr = $student->primaryEnrollment;
        return $this->result('ok', null, $data + ['_row_data' => ['student_id' => $student->id, 'enrollment_id' => $enr?->id, 'batch_id' => $enr?->batch_id,
            'fee_category_id' => $cat->id, 'amount' => $data['amount'], 'discount' => '0.00', 'paid_amount' => $data['amount'], 'month' => ($data['month'] ?? '') ?: null,
            'payment_method' => ($data['payment_method'] ?? '') ?: 'cash', 'receipt_no' => $receipt, 'line_no' => $line, 'paid_at' => $data['paid_at'], 'collected_by' => null, 'status' => 'paid']]);
    }

    public function create(array $data): array
    {
        return ['fee_payments', FeePayment::create($data['_row_data'])->id];
    }

    public function undo(string $table, int $id): ?string
    {
        return __('errors.import_money_kept');
    }
}
