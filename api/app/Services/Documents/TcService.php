<?php

namespace App\Services\Documents;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Institution, MemoNumber, Student, TcCertificate};
use App\Services\EnrollmentService;
use App\Services\Memo\MemoService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

// D210 PTC.1 (docs/modules/promotion-tc.md "Transfer Certificate"): issuing a TC gives it the next TC number (TC-YYYY-NNNN) and a memo
// number (kind `tc`), ends the student's active enrollments as `transferred` and marks the student transferred - all in one
// transaction. Cancelling a TC keeps it (revoked_at) and cancels its memo number; the student's record is not changed back.
class TcService
{
    public function __construct(private MemoService $memos, private EnrollmentService $enrollments) {}

    public function issue(Student $student, array $d, int $by): TcCertificate
    {
        return DB::transaction(function () use ($student, $d, $by) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->value('id');
            $student = Student::whereKey($student->id)->lockForUpdate()->firstOrFail();
            if ($student->status === 'transferred') throw new BusinessException('already transferred', 'student_transferred', 422);
            $prefix = 'TC-' . now()->format('Y') . '-';
            $last = TcCertificate::where('tc_number', 'like', $prefix . '%')->orderByDesc('tc_number')->value('tc_number');
            $tcNo = $prefix . str_pad((string) ($last ? ((int) substr($last, -4)) + 1 : 1), 4, '0', STR_PAD_LEFT);
            $memo = $this->memos->issue('tc', $student->user?->name, null, $by);
            $tc = TcCertificate::create(['student_id' => $student->id, 'tc_number' => $tcNo, 'reason' => $d['reason'] ?? null, 'last_class' => $d['last_class'] ?? null,
                'last_attendance_date' => $d['last_attendance_date'] ?? null, 'conduct' => $d['conduct'] ?? 'ভালো', 'issued_date' => now()->toDateString(), 'issued_by' => $by,
                'memo_no' => $memo->memo_no, 'verify_code' => app(CertificateService::class)->newCode()]);   // CERT.1: the public check
            $this->memos->attach($memo, 'tc_certificate:' . $tc->id);
            foreach ($student->activeEnrollments()->get() as $e) $this->enrollments->end($e, 'transferred', 'TC ' . $tcNo);
            $student->refresh()->update(['status' => 'transferred']);
            AuditLog::record('tc.issued', $tc, ['tc_number' => $tcNo, 'memo_no' => $memo->memo_no]);
            return $tc;
        });
    }

    public function cancel(TcCertificate $tc, string $reason): TcCertificate
    {
        return DB::transaction(function () use ($tc, $reason) {
            $tc = TcCertificate::whereKey($tc->id)->lockForUpdate()->firstOrFail();
            if ($tc->revoked_at) throw new BusinessException('already cancelled', 'tc_revoked', 422);
            $tc->update(['revoked_at' => now()]);
            if ($m = MemoNumber::where('memo_no', $tc->memo_no)->first()) { if ($m->status === 'issued') $this->memos->cancel($m, $reason); }
            AuditLog::record('tc.cancelled', $tc, ['reason' => mb_substr($reason, 0, 200)]);
            return $tc;
        });
    }
}
