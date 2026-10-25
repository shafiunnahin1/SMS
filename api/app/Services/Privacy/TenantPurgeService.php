<?php

namespace App\Services\Privacy;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Institution};
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\{Cache, DB, Storage};

// docs/legal/privacy-and-consent.md section 5.3 (D27: `tenant:purge`, by manual approval only). An institution that has been
// suspended or expired for 30+ days can be removed completely: every row with its institution_id (children first, ORDER),
// the users' tokens and one-time codes, both disks' institutions/{id}/ folders, its cache keys, and finally the institution.
// What remains is one platform audit row with counts only - no personal data. Cannot be undone (backups age out in 30 days).
class TenantPurgeService
{
    public const WAIT_DAYS = 30;

    /** Every table with an institution_id, children before parents (FK order). TenantPurgeFilesTest fails when a new one is missing. */
    public const ORDER = [
        'account_activation_requests', 'institution_registrations',
        'department_duty_assignments', 'department_memberships', 'department_duties', 'institution_departments',
        'learner_profiles', 'ai_answer_reveals', 'ai_reviews', 'ai_messages', 'ai_conversations', 'ai_answer_bank', 'exam_result_sms', 'exam_mark_submissions', 'exam_papers', 'qb_paper_items', 'qb_paper_sections', 'qb_paper_variants', 'qb_omr_scans', 'qb_omr_forms', 'qb_papers', 'qb_paper_folders', 'qb_quiz_attempts', 'qb_student_package_access', 'qb_student_unlocks',   // D165 learner profiles; D65 question bank; D127 scans/forms before papers
        'qb_student_orders', 'qb_unlocks',
        'salary_adjustments', 'salary_advances', 'donations', 'donation_campaigns', 'donation_funds', 'donors', 'budget_lines', 'budgets', 'voucher_lines', 'vouchers', 'ledger_accounts', 'provident_fund_entries', 'payroll_items', 'payroll_runs', 'salary_structure_lines', 'salary_structures', 'salary_revisions', 'salary_components', 'salary_pay_accounts', 'bonus_schemes',
        'leave_applications', 'leave_types', 'staff_mapping_reviews', 'staff_attendances', 'teacher_attendances', 'staff_members',
        'inventory_movements', 'inventory_items',   // R3.9 store: movements reference items
        'fee_refunds', 'cash_book_closings', 'expenses', 'results', 'exam_subjects', 'attendances', 'fee_payments', 'fee_structures', 'consents', 'parent_student', 'enrollments',
        'import_rows', 'import_jobs', 'sms_logs', 'sms_credit_transactions', 'batch_teachers', 'teacher_subjects', 'exams',
        'students', 'batches', 'subjects', 'teachers', 'programs', 'fee_categories', 'holidays', 'academic_years',
        'subscription_invoices', 'payments', 'audit_logs', 'users',
    ];

    /** Since when the institution has been out of service: the last suspension (audit) or the subscription's expiry */
    public function inactiveSince(Institution $i): ?Carbon
    {
        if ($i->status === 'suspended') {
            $at = AuditLog::anyInstitution()->where('institution_id', $i->id)->where('action', 'institution.suspended')->max('created_at');
            return $at ? Carbon::parse($at) : null;
        }
        return $i->status === 'expired' ? $i->subscription_expires_at : null;
    }

    public function eligible(Institution $i): bool
    {
        $since = $this->inactiveSince($i);
        return $since !== null && $since->lte(now()->subDays(self::WAIT_DAYS));
    }

    /** Institutions that may be purged now */
    public function candidates()
    {
        return Institution::whereIn('status', ['suspended', 'expired'])->orderBy('id')->get()->filter(fn ($i) => $this->eligible($i))->values();
    }

    /** What a purge would remove: rows per table and files on each disk */
    public function dryRun(Institution $i): array
    {
        $this->assertEligible($i);
        return ['tables' => collect(self::ORDER)->mapWithKeys(fn ($t) => [$t => DB::table($t)->where('institution_id', $i->id)->count()])->all(),
            'files' => $this->files($i)];
    }

    public function execute(Institution $i, int $by): array
    {
        $this->assertEligible($i);
        $userIds = DB::table('users')->where('institution_id', $i->id)->pluck('id');
        $files = $this->files($i);
        $counts = DB::transaction(function () use ($i, $userIds) {
            $counts = [];
            DB::table('personal_access_tokens')->where('tokenable_type', \App\Models\User::class)->whereIn('tokenable_id', $userIds)->delete();
            // D90: activation evidence references OTP rows and must be purged first.
            $counts['account_activation_requests'] = DB::table('account_activation_requests')->where('institution_id', $i->id)->delete();
            DB::table('otp_tokens')->whereIn('user_id', $userIds)->delete();
            foreach (self::ORDER as $t) {
                if ($t === 'account_activation_requests') continue;
                if ($t === 'users') DB::table('institutions')->where('id', $i->id)->update(['switched_by' => null]);
                if ($t === 'qb_paper_folders') DB::table($t)->where('institution_id', $i->id)->update(['parent_id' => null]);   // D126: folders point at folders
                if ($t === 'expenses') {
                    // D27 approved full-tenant purge: immutable expense ledger children precede their parents.
                    $counts[$t] = 0;
                    DB::table($t)->where('institution_id', $i->id)->orderByDesc('id')->chunkByIdDesc(500, function ($rows) use ($t, $i, &$counts) {
                        foreach ($rows as $row) $counts[$t] += DB::table($t)->where('institution_id', $i->id)->where('id', $row->id)->delete();
                    });
                } else $counts[$t] = DB::table($t)->where('institution_id', $i->id)->delete();
            }
            DB::table('institutions')->where('id', $i->id)->delete();
            return $counts;
        });
        foreach (['private', 'public'] as $disk) Storage::disk($disk)->deleteDirectory("institutions/{$i->id}");
        foreach (["bootstrap:{$i->id}", "theme:{$i->id}", "current_year:{$i->id}", 'tenant:host:' . $i->slug . '.' . config('tenancy.base_domain')] as $key) Cache::forget($key);

        // the platform's own record: counts and who, never names (section 5.3 step 4)
        AuditLog::anyInstitution()->create(['institution_id' => null, 'user_id' => $by, 'action' => 'tenant.purged', 'model' => 'Institution', 'model_id' => $i->id,
            'new_data' => ['rows' => array_sum($counts), 'tables' => array_filter($counts), 'files' => $files], 'ip_address' => request()?->ip()]);
        return ['tables' => $counts, 'files' => $files];
    }

    private function assertEligible(Institution $i): void
    {
        if (!$this->eligible($i)) throw new BusinessException('not suspended or expired for 30 days', 'purge_not_eligible', 422, ['days' => self::WAIT_DAYS]);
    }

    private function files(Institution $i): array
    {
        return collect(['private', 'public'])->mapWithKeys(fn ($d) => [$d => count(Storage::disk($d)->allFiles("institutions/{$i->id}"))])->all();
    }
}
