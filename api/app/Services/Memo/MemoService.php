<?php

namespace App\Services\Memo;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Institution, MemoFile, MemoNumber};
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

// D210 MEMO.1: memo (smarak) numbers in the Secretariat Instructions 2024 form - 22 digits in 8 dot-separated parts
// MM.DD.GGGG.SSS.BBB.TT.NNNN.YY, then '.' and the issue (jari) number. The institution's codes (MM..BBB and one subject code TT per
// document kind) are in institutions.settings.memo; a code that does not apply stays zeros. The system opens one file per document
// kind and year (NNNN per subject code and year from 0001) and gives each issued document the next issue number, under the
// institution row lock. A number is never reused or deleted; cancelling keeps it with status `cancelled`.
class MemoService
{
    public const KINDS = ['tc', 'attestation', 'testimonial', 'certificate', 'letter', 'notice'];
    /** part => exact digit count */
    public const CODES = ['ministry' => 2, 'office' => 2, 'geo' => 4, 'sub_institution' => 3, 'branch' => 3];
    public const DEFAULT_SUBJECTS = ['tc' => '01', 'attestation' => '02', 'testimonial' => '03', 'certificate' => '04', 'letter' => '05', 'notice' => '06'];

    public function settings(Institution $i): array
    {
        $s = (array) (($i->settings ?? [])['memo'] ?? []);
        $out = [];
        foreach (self::CODES as $k => $len) $out[$k] = preg_match('/^\d{' . $len . '}$/', (string) ($s[$k] ?? '')) ? $s[$k] : str_repeat('0', $len);
        $out['subjects'] = [];
        foreach (self::DEFAULT_SUBJECTS as $k => $def) $out['subjects'][$k] = preg_match('/^\d{2}$/', (string) ($s['subjects'][$k] ?? '')) ? $s['subjects'][$k] : $def;
        return $out;
    }

    /** issue the next memo number for a document kind; $sourceKey '<type>:<id>' links the register to the document */
    public function issue(string $kind, ?string $recipient = null, ?string $sourceKey = null, ?int $by = null): MemoNumber
    {
        if (!in_array($kind, self::KINDS, true)) throw new \InvalidArgumentException("unknown memo kind {$kind}");
        return DB::transaction(function () use ($kind, $recipient, $sourceKey, $by) {
            $i = Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            $year = (int) now()->format('Y');
            $file = MemoFile::where('doc_kind', $kind)->where('year', $year)->lockForUpdate()->first() ?? $this->open($i, $kind, $year);
            $issue = $file->next_issue;
            $file->update(['next_issue' => $issue + 1]);
            $m = MemoNumber::create(['memo_file_id' => $file->id, 'issue_no' => $issue, 'memo_no' => $file->file_no . '.' . $issue, 'doc_kind' => $kind,
                'source_key' => $sourceKey, 'recipient' => $recipient ? mb_substr($recipient, 0, 150) : null, 'status' => 'issued', 'issued_by' => $by ?? auth()->id(), 'issued_at' => now()]);
            AuditLog::record('memo.issued', $m, ['memo_no' => $m->memo_no, 'doc_kind' => $kind]);
            return $m;
        });
    }

    public function attach(MemoNumber $m, string $sourceKey): void
    {
        $m->forceFill(['source_key' => $sourceKey])->save();
    }

    public function cancel(MemoNumber $m, string $reason): MemoNumber
    {
        return DB::transaction(function () use ($m, $reason) {
            $m = MemoNumber::whereKey($m->id)->lockForUpdate()->firstOrFail();
            if ($m->status === 'cancelled') throw new BusinessException('already cancelled', 'memo_cancelled', 422);
            $m->update(['status' => 'cancelled', 'cancelled_at' => now(), 'cancel_reason' => mb_substr($reason, 0, 255)]);
            AuditLog::record('memo.cancelled', $m, ['memo_no' => $m->memo_no]);
            return $m;
        });
    }

    /** a new file for this kind and year: the next serial of its subject code; the codes as they are now are frozen in file_no */
    private function open(Institution $i, string $kind, int $year): MemoFile
    {
        $s = $this->settings($i);
        $subject = $s['subjects'][$kind];
        $serial = (int) MemoFile::where('subject_code', $subject)->where('year', $year)->max('file_serial') + 1;
        if ($serial > 9999) throw new BusinessException('no file numbers left this year', 'memo_files_full', 422);
        $fileNo = implode('.', [$s['ministry'], $s['office'], $s['geo'], $s['sub_institution'], $s['branch'], $subject, str_pad((string) $serial, 4, '0', STR_PAD_LEFT), substr((string) $year, -2)]);
        return MemoFile::create(['doc_kind' => $kind, 'subject_code' => $subject, 'file_serial' => $serial, 'year' => $year, 'file_no' => $fileNo, 'next_issue' => 1]);
    }
}
