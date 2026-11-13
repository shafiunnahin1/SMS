<?php

namespace App\Services\Documents;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Certificate, Institution, MemoNumber, Student, TcCertificate};
use App\Services\Memo\MemoService;
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

// D210 CERT.1: issuing a certificate gives it CERT-YYYY-NNNN, the next memo number (attestation / testimonial / certificate) and a
// 12-character verify code (docs/modules/quick-wins.md section 2: 31 unambiguous characters, CSPRNG, unique per institution).
// Cancelling keeps it (revoked_at) and cancels its memo number. The public check answers valid / revoked / not found with a masked name.
class CertificateService
{
    public const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    public function __construct(private MemoService $memos) {}

    public function issue(Student $student, array $d, int $by): Certificate
    {
        return DB::transaction(function () use ($student, $d, $by) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->value('id');
            $prefix = 'CERT-' . now()->format('Y') . '-';
            $last = Certificate::where('certificate_no', 'like', $prefix . '%')->orderByDesc('certificate_no')->value('certificate_no');
            $no = $prefix . str_pad((string) ($last ? ((int) substr($last, -4)) + 1 : 1), 4, '0', STR_PAD_LEFT);
            $c = new Certificate(['student_id' => $student->id, 'type' => $d['type'], 'title' => $d['title'], 'description' => $d['description'] ?? null,
                'issued_date' => now()->toDateString(), 'issued_by' => $by, 'certificate_no' => $no, 'verify_code' => $this->newCode()]);
            $memo = $this->memos->issue($c->memoKind(), $student->user?->name, null, $by);
            $c->memo_no = $memo->memo_no;
            $c->save();
            $this->memos->attach($memo, 'certificate:' . $c->id);
            AuditLog::record('certificate.issued', $c, ['certificate_no' => $no, 'type' => $c->type, 'memo_no' => $memo->memo_no]);
            return $c;
        });
    }

    public function cancel(Certificate $c, string $reason): Certificate
    {
        return DB::transaction(function () use ($c, $reason) {
            $c = Certificate::whereKey($c->id)->lockForUpdate()->firstOrFail();
            if ($c->revoked_at) throw new BusinessException('already cancelled', 'certificate_revoked', 422);
            $c->update(['revoked_at' => now()]);
            if (($m = MemoNumber::where('memo_no', $c->memo_no)->first()) && $m->status === 'issued') $this->memos->cancel($m, $reason);
            AuditLog::record('certificate.cancelled', $c, ['reason' => mb_substr($reason, 0, 200)]);
            return $c;
        });
    }

    /** the public check of a code (certificate or TC of THIS institution): state, kind, number, date, masked name - nothing else */
    public function check(string $code): array
    {
        $code = strtoupper(trim($code));
        $doc = preg_match('/^[' . self::CODE_ALPHABET . ']{12}$/', $code)
            ? (Certificate::with('student.user:id,name')->where('verify_code', $code)->first() ?? TcCertificate::with('student.user:id,name')->where('verify_code', $code)->first()) : null;
        if (!$doc) return ['status' => 'not_found'];
        return ['status' => $doc->revoked_at ? 'revoked' : 'valid', 'revoked_on' => $doc->revoked_at?->toDateString(),
            'kind' => $doc instanceof Certificate ? $doc->type : 'tc', 'number' => $doc instanceof Certificate ? $doc->certificate_no : $doc->tc_number,
            'issued_date' => $doc->issued_date?->toDateString(), 'holder' => self::mask($doc->student?->user?->name)];
    }

    public function newCode(): string
    {
        for ($n = 0; $n < 10; $n++) {
            $code = '';
            for ($k = 0; $k < 12; $k++) $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
            if (!Certificate::where('verify_code', $code)->exists() && !TcCertificate::where('verify_code', $code)->exists()) return $code;
        }
        throw new \RuntimeException('could not make a unique verify code');
    }

    /** quick-wins.md section 2: "রাফি আলম" -> "রা*** আ***" - only the first letter (grapheme: রা is one letter) of each word */
    public static function mask(?string $name): ?string
    {
        if ($name === null || trim($name) === '') return null;
        return implode(' ', array_map(fn ($w) => (preg_match('/^\X/u', $w, $m) ? $m[0] : '') . '***', preg_split('/\s+/u', trim($name))));
    }
}
