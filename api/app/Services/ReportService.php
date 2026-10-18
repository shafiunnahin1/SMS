<?php

namespace App\Services;

use App\Models\{Attendance, Batch, Enrollment, FeePayment, Holiday, Program, Student};
use App\Support\Money;
use Illuminate\Support\Carbon;

// Step 4.8 (docs/modules/pdf-reports.md): the R1 reports as plain tables - title, filter line, headings, rows, an optional
// total row. ReportController prints them as PDF (Chromium, D50) or Excel. Column labels use the institution's terms.
class ReportService
{
    public const ADMIN = ['students', 'attendance', 'dues', 'fees'];
    public const ACCOUNTANT = ['dues', 'fees'];

    public function __construct(private FeeService $fees) {}

    public function build(string $type, array $f): array
    {
        return match ($type) {
            'students' => $this->classList($f),
            'attendance' => $this->attendance($f),
            'dues' => $this->dues($f),
            'fees' => $this->collection($f),
        };
    }

    /** Class list: active enrollments of a program or a batch, by batch and roll */
    private function classList(array $f): array
    {
        $rows = $this->enrollments($f)->map(fn ($e) => [$e->batch?->name, $e->roll_no, $e->student?->student_id, $e->student?->user?->name, $e->student?->guardian_phone]);
        return ['title' => __('pdf.reports.students'), 'filters' => $this->scopeLine($f),
            'headings' => [term('batch'), __('pdf.reports.roll'), __('pdf.reports.id'), __('pdf.reports.name'), __('pdf.reports.guardian_phone')],
            'rows' => $rows->values()->all(), 'total' => [__('pdf.reports.count', ['count' => $rows->count()])]];
    }

    /** Month sheet of one batch: a column per day (P/A/L/V, H = holiday), then the month's percentage */
    private function attendance(array $f): array
    {
        $batch = Batch::findOrFail($f['batch_id']);
        $start = Carbon::parse($f['month'] . '-01');
        $days = $start->daysInMonth;
        $marks = Attendance::where('batch_id', $batch->id)->whereBetween('date', [$start->toDateString(), $start->copy()->endOfMonth()->toDateString()])
            ->get(['student_id', 'date', 'status'])->groupBy('student_id');
        $holidays = Holiday::whereBetween('date', [$start->toDateString(), $start->copy()->endOfMonth()->toDateString()])->pluck('date')
            ->map(fn ($d) => (int) Carbon::parse($d)->day)->all();
        $letter = ['present' => 'P', 'absent' => 'A', 'late' => 'L', 'leave' => 'V'];
        $rows = $this->enrollments(['batch_id' => $batch->id])->map(function ($e) use ($marks, $days, $holidays, $letter) {
            $byDay = ($marks[$e->student_id] ?? collect())->mapWithKeys(fn ($a) => [(int) $a->date->day => $a->status]);
            $cells = [];
            for ($d = 1; $d <= $days; $d++) $cells[] = isset($byDay[$d]) ? $letter[$byDay[$d]] : (in_array($d, $holidays, true) ? 'H' : '');
            $taken = $byDay->count();
            $present = $byDay->filter(fn ($s) => in_array($s, ['present', 'late'], true))->count();
            return [$e->roll_no, $e->student?->user?->name, ...$cells, $taken ? round($present / $taken * 100) . '%' : '—'];
        });
        return ['title' => __('pdf.reports.attendance'), 'filters' => term('batch') . ': ' . $batch->name . ' · ' . $start->format('m/Y') . ' · ' . __('pdf.reports.legend'),
            'headings' => [__('pdf.reports.roll'), __('pdf.reports.name'), ...array_map('strval', range(1, $days)), '%'],
            'rows' => $rows->values()->all(), 'landscape' => true, 'compact' => true];
    }

    /** Due list: every unpaid due of the students of a program / batch (FeeService::dueLines - the same numbers as the counter) */
    private function dues(array $f): array
    {
        $grand = 0;
        $rows = $this->enrollments($f)->unique('student_id')->map(function ($e) use (&$grand) {
            $lines = $this->fees->dueLines($e->student);
            if ($lines->isEmpty()) return null;
            $paisa = $lines->sum(fn ($l) => Money::toPaisa($l['amount']));
            $grand += $paisa;
            return [$e->batch?->name, $e->roll_no, $e->student?->student_id, $e->student?->user?->name, $e->student?->guardian_phone,
                $lines->map(fn ($l) => $l['category'] . ' ' . $l['period'])->implode(', '), Money::format($paisa)];
        })->filter();
        return ['title' => __('pdf.reports.dues'), 'filters' => $this->scopeLine($f),
            'headings' => [term('batch'), __('pdf.reports.roll'), __('pdf.reports.id'), __('pdf.reports.name'), __('pdf.reports.guardian_phone'), __('pdf.reports.items'), __('pdf.reports.amount')],
            'rows' => $rows->values()->all(), 'total' => [__('pdf.reports.total'), '', '', __('pdf.reports.count', ['count' => $rows->count()]), '', '', Money::format($grand)]];
    }

    /** Collection: every receipt line of a month (paid_at), optional program / fee head */
    private function collection(array $f): array
    {
        $start = Carbon::parse($f['month'] . '-01');
        $lines = FeePayment::whereBetween('paid_at', [$start->copy()->startOfMonth(), $start->copy()->endOfMonth()])
            ->when($f['program_id'] ?? null, fn ($q, $p) => $q->whereIn('batch_id', Batch::where('program_id', $p)->select('id')))
            ->when($f['fee_category_id'] ?? null, fn ($q, $c) => $q->where('fee_category_id', $c))
            ->with(['student.user:id,name', 'batch:id,name', 'feeCategory:id,name'])->orderBy('paid_at')->orderBy('receipt_no')->orderBy('line_no')->get();
        $rows = $lines->map(fn ($l) => [$l->receipt_no, $l->paid_at?->format('d/m/Y'), $l->student?->user?->name, $l->batch?->name, $l->feeCategory?->name,
            $l->month, \Illuminate\Support\Facades\Lang::has('pdf.receipt.methods.' . $l->payment_method) ? __('pdf.receipt.methods.' . $l->payment_method) : $l->payment_method, $l->paid_amount]);
        $total = Money::format($lines->sum(fn ($l) => Money::toPaisa($l->paid_amount)));
        return ['title' => __('pdf.reports.fees'), 'filters' => $start->format('m/Y') . (($f['program_id'] ?? null) ? ' · ' . term('program') . ': ' . Program::whereKey($f['program_id'])->value('name') : ''),
            'headings' => [__('pdf.receipt.no'), __('pdf.receipt.date'), __('pdf.reports.name'), term('batch'), __('pdf.receipt.item'), __('pdf.receipt.period'), __('pdf.receipt.method'), __('pdf.reports.amount')],
            'rows' => $rows->values()->all(), 'total' => [__('pdf.reports.total'), '', '', '', '', '', '', $total]];
    }

    private function enrollments(array $f)
    {
        return Enrollment::where('status', 'active')
            ->when($f['batch_id'] ?? null, fn ($q, $b) => $q->where('batch_id', $b))
            ->when($f['program_id'] ?? null, fn ($q, $p) => $q->where('program_id', $p))
            ->with(['student:id,student_id,user_id,guardian_phone', 'student.user:id,name', 'batch:id,name'])
            ->orderBy('batch_id')->orderByRaw('roll_no IS NULL')->orderBy('roll_no')->orderBy('id')->get();
    }

    private function scopeLine(array $f): string
    {
        $parts = [];
        if ($f['program_id'] ?? null) $parts[] = term('program') . ': ' . Program::whereKey($f['program_id'])->value('name');
        if ($f['batch_id'] ?? null) $parts[] = term('batch') . ': ' . Batch::whereKey($f['batch_id'])->value('name');
        return implode(' · ', $parts) ?: __('pdf.reports.all');
    }
}
