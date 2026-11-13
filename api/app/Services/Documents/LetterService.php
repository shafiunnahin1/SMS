<?php

namespace App\Services\Documents;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, MemoNumber, Notice, OfficialLetter};
use App\Services\Memo\MemoService;
use Illuminate\Support\Facades\DB;

// D210 LTR.1: an official letter takes the next memo number (kind `letter`); a new notice takes one of kind `notice`. Cancelling a
// letter keeps it (status cancelled) and cancels its memo number; deleting a notice (soft) cancels its memo number.
class LetterService
{
    public function __construct(private MemoService $memos) {}

    public function issue(array $d, int $by): OfficialLetter
    {
        return DB::transaction(function () use ($d, $by) {
            $memo = $this->memos->issue('letter', $d['recipient'], null, $by);
            $l = OfficialLetter::create(['memo_no' => $memo->memo_no, 'subject' => $d['subject'], 'recipient' => $d['recipient'], 'body' => $d['body'],
                'issued_date' => now()->toDateString(), 'issued_by' => $by, 'status' => 'issued']);
            $this->memos->attach($memo, 'official_letter:' . $l->id);
            AuditLog::record('letter.issued', $l, ['memo_no' => $memo->memo_no]);
            return $l;
        });
    }

    public function cancel(OfficialLetter $l, string $reason): OfficialLetter
    {
        return DB::transaction(function () use ($l, $reason) {
            $l = OfficialLetter::whereKey($l->id)->lockForUpdate()->firstOrFail();
            if ($l->status === 'cancelled') throw new BusinessException('already cancelled', 'letter_cancelled', 422);
            $l->update(['status' => 'cancelled']);
            $this->cancelMemo($l->memo_no, $reason);
            AuditLog::record('letter.cancelled', $l, ['reason' => mb_substr($reason, 0, 200)]);
            return $l;
        });
    }

    public function numberNotice(Notice $n, int $by): void
    {
        $memo = $this->memos->issue('notice', mb_substr($n->title, 0, 150), 'notice:' . $n->id, $by);
        $n->forceFill(['memo_no' => $memo->memo_no])->save();
    }

    public function cancelMemo(?string $memoNo, string $reason): void
    {
        if ($memoNo && ($m = MemoNumber::where('memo_no', $memoNo)->first()) && $m->status === 'issued') $this->memos->cancel($m, $reason);
    }
}
