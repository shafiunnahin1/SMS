<?php

namespace App\Services\Library;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Book, BookIssue, FeeCategory, FeePayment, Student, User};
use App\Notifications\GeneralNotification;
use App\Services\{CashBookService, FeeService};
use App\Support\{Money, Tenancy};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

// D227 LIB.1 (docs/modules/library.md): books lent to students. The loan period and the day fine are institution settings
// (14 days, 5.00 taka by default); the fine = whole late days x the day fine, computed on return. A fine is collected as a fee
// receipt line in the category 'Library fine' (program-specific with no structure, so it is never a general due) and the issue is
// marked paid in the same transaction; the admin may waive an unpaid fine (to 0, the old amount and reason in the audit log).
class LibraryService
{
    public const FINE_CATEGORY = 'লাইব্রেরি জরিমানা';

    public function settings(): array
    {
        $s = data_get(Tenancy::current()?->settings ?? [], 'library', []);
        return ['loan_days' => max(1, min(365, (int) ($s['loan_days'] ?? 14))), 'fine_per_day' => Money::format(Money::toPaisa((string) ($s['fine_per_day'] ?? '5.00')))];
    }

    public function saveSettings(int $loanDays, string $finePerDay): array
    {
        $i = Tenancy::current();
        $all = $i->settings ?? [];
        $all['library'] = ['loan_days' => $loanDays, 'fine_per_day' => Money::format(Money::toPaisa($finePerDay))];
        $i->forceFill(['settings' => $all])->save();
        AuditLog::record('library.settings', $i, $all['library']);
        return $this->settings();
    }

    public function issue(Book $book, Student $student, User $by): BookIssue
    {
        return DB::transaction(function () use ($book, $student, $by) {
            $b = Book::lockForUpdate()->findOrFail($book->id);
            if ((int) $b->available_copies < 1) throw new BusinessException(__('library.none_available'), 'book_not_available', 422);
            $b->decrement('available_copies');
            $row = BookIssue::create(['book_id' => $b->id, 'student_id' => $student->id, 'issued_by' => $by->id, 'issue_date' => now()->toDateString(),
                'due_date' => now()->addDays($this->settings()['loan_days'])->toDateString(), 'status' => 'issued', 'fine_amount' => '0.00', 'fine_paid' => false]);
            AuditLog::record('library.issued', $row);
            return $row;
        });
    }

    /** whole days late on $on x the day fine */
    public function fineFor(BookIssue $i, Carbon $on): string
    {
        $late = max(0, (int) $i->due_date->copy()->startOfDay()->diffInDays($on->copy()->startOfDay(), false));
        return Money::format($late * Money::toPaisa($this->settings()['fine_per_day']));
    }

    public function return(BookIssue $issue): BookIssue
    {
        return DB::transaction(function () use ($issue) {
            $i = BookIssue::lockForUpdate()->findOrFail($issue->id);
            if ($i->status === 'returned') throw new BusinessException(__('library.already_returned'), 'book_already_returned', 409);
            $i->update(['return_date' => now()->toDateString(), 'fine_amount' => $this->fineFor($i, now()), 'status' => 'returned']);
            Book::whereKey($i->book_id)->lockForUpdate()->first()?->increment('available_copies');
            AuditLog::record('library.returned', $i);
            return $i->fresh();
        });
    }

    /** the fine as one fee receipt line; returns the receipt number */
    public function collectFine(BookIssue $issue, string $method): string
    {
        return DB::transaction(function () use ($issue, $method) {
            app(CashBookService::class)->lockInstitution();
            $i = BookIssue::lockForUpdate()->findOrFail($issue->id);
            if ($i->status !== 'returned' || $i->fine_paid || Money::toPaisa((string) $i->fine_amount) <= 0) throw new BusinessException(__('library.no_fine'), 'library_no_fine', 409);
            app(CashBookService::class)->assertCashWrite(now()->toDateString(), $method);
            $cat = FeeCategory::firstOrCreate(['name' => self::FINE_CATEGORY], ['amount' => '0.00', 'frequency' => 'once', 'applicable_to' => 'program_specific']);
            $student = Student::findOrFail($i->student_id);
            $receipt = app(FeeService::class)->nextReceiptNo();
            FeePayment::create(['student_id' => $student->id, 'enrollment_id' => null, 'batch_id' => $student->batch_id, 'fee_category_id' => $cat->id,
                'amount' => $i->fine_amount, 'discount' => '0.00', 'paid_amount' => $i->fine_amount, 'month' => null, 'payment_method' => $method,
                'receipt_no' => $receipt, 'line_no' => 1, 'paid_at' => now(), 'collected_by' => auth()->id(), 'status' => 'paid']);
            $i->update(['fine_paid' => true]);
            AuditLog::record('library.fine_collected', $i, ['receipt_no' => $receipt]);
            return $receipt;
        });
    }

    public function waive(BookIssue $issue, string $reason): BookIssue
    {
        return DB::transaction(function () use ($issue, $reason) {
            $i = BookIssue::lockForUpdate()->findOrFail($issue->id);
            if ($i->fine_paid || Money::toPaisa((string) $i->fine_amount) <= 0) throw new BusinessException(__('library.no_fine'), 'library_no_fine', 409);
            AuditLog::record('library.fine_waived', $i, ['was' => (string) $i->fine_amount, 'reason' => $reason]);
            $i->update(['fine_amount' => '0.00']);
            return $i->fresh();
        });
    }

    /** the daily job: issues past their due date become overdue once; the student and the parents get one in-app notice */
    public function markOverdue(): int
    {
        $n = 0;
        BookIssue::with('book:id,title')->where('status', 'issued')->where('due_date', '<', now()->toDateString())->get()->each(function (BookIssue $i) use (&$n) {
            $done = BookIssue::whereKey($i->id)->where('status', 'issued')->update(['status' => 'overdue']);
            if (!$done) return;
            $n++;
            $student = Student::with('parents')->find($i->student_id);
            $users = collect([$student?->user_id ? User::find($student->user_id) : null])->merge($student?->parents ?? [])->filter()->unique('id');
            $body = __('library.overdue_body', ['title' => $i->book?->title, 'date' => $i->due_date->format('Y-m-d')]);
            $users->each(fn ($u) => $u->notify(new GeneralNotification(__('library.overdue_title'), $body, 'library_overdue', ['book_issue_id' => $i->id])));
        });
        return $n;
    }

    public static function row(BookIssue $i): array
    {
        return ['id' => $i->id, 'book' => ['id' => $i->book_id, 'title' => $i->book?->title], 'student' => $i->relationLoaded('student') && $i->student ? ['id' => $i->student->id, 'name' => $i->student->user?->name, 'student_id' => $i->student->student_id] : ['id' => $i->student_id],
            'issue_date' => $i->issue_date->format('Y-m-d'), 'due_date' => $i->due_date->format('Y-m-d'), 'return_date' => $i->return_date?->format('Y-m-d'),
            'fine_amount' => (string) $i->fine_amount, 'fine_paid' => (bool) $i->fine_paid, 'status' => $i->status];
    }
}
