<?php

namespace App\Services\Admission;

use App\Exceptions\BusinessException;
use App\Models\{AdmissionCycle, AdmissionDraw, AdmissionLead, AuditLog};
use Illuminate\Support\Facades\DB;

// D209 ACY.1 (docs/modules/admission-cycle.md sections 1 and 3): the cycle's state machine - draft -> open -> testing -> listing ->
// closed, one step at a time, never back. Opening a lottery cycle makes the seed's commitment (the seed is returned ONCE and never
// stored); freezing records the applicants' hash. testing -> listing happens only by building the list (ACY.3).
class AdmissionCycleService
{
    public const RULE_DEFAULTS = ['mode' => 'merit', 'waiting' => 0, 'min_marks' => null, 'tie_break' => ['applied_at'], 'confirm_within_days' => 7, 'publish_names' => false];
    /** unambiguous letters and digits (no 0/O, 1/I/L) */
    private const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    public function rule(array $in): array
    {
        $r = array_merge(self::RULE_DEFAULTS, array_intersect_key($in, self::RULE_DEFAULTS));
        $r['tie_break'] = ['applied_at'];   // the only tie-break this version knows
        $r['waiting'] = (int) $r['waiting'];
        $r['confirm_within_days'] = (int) $r['confirm_within_days'];
        $r['publish_names'] = (bool) $r['publish_names'];
        $r['min_marks'] = $r['min_marks'] === null || $r['min_marks'] === '' ? null : number_format((float) $r['min_marks'], 2, '.', '');
        return $r;
    }

    /** draft -> open. For a lottery: returns the 64-hex seed, shown to the admin this once; only sha256(seed bytes) is kept. */
    public function open(AdmissionCycle $c): ?string
    {
        return DB::transaction(function () use ($c) {
            $c = $this->locked($c, 'draft');
            $seed = null;
            if (($c->rule['mode'] ?? 'merit') === 'lottery') {
                $bytes = random_bytes(32);
                $seed = bin2hex($bytes);
                AdmissionDraw::create(['cycle_id' => $c->id, 'seed_commitment' => hash('sha256', $bytes)]);
            }
            $c->update(['status' => 'open']);
            AuditLog::record('admission_cycle.opened', $c, ['mode' => $c->rule['mode'] ?? 'merit']);   // never the seed
            return $seed;
        });
    }

    /** open -> testing: no more applications; the eligible applicants' hash is fixed (lottery) */
    public function freeze(AdmissionCycle $c): AdmissionCycle
    {
        return DB::transaction(function () use ($c) {
            $c = $this->locked($c, 'open');
            $nos = $this->eligible($c)->pluck('application_no')->sort(SORT_STRING)->values()->all();
            if ($draw = AdmissionDraw::where('cycle_id', $c->id)->lockForUpdate()->first()) {
                $draw->update(['applicants_count' => count($nos), 'result' => array_merge($draw->result ?? [], ['applicants_hash' => self::applicantsHash($nos)])]);
            }
            $c->update(['status' => 'testing']);
            AuditLog::record('admission_cycle.frozen', $c, ['applicants' => count($nos)]);
            return $c;
        });
    }

    /** listing -> closed: whoever was not admitted (and did not decline) is rejected */
    public function close(AdmissionCycle $c): AdmissionCycle
    {
        return DB::transaction(function () use ($c) {
            $c = $this->locked($c, 'listing');
            AdmissionLead::where('cycle_id', $c->id)->where(fn ($q) => $q->whereNull('list_status')->orWhereNotIn('list_status', ['admitted', 'declined', 'rejected']))
                ->update(['list_status' => 'rejected']);
            $c->update(['status' => 'closed']);
            AuditLog::record('admission_cycle.closed', $c);
            return $c;
        });
    }

    /** the applications that take part (ACY.2 adds: the fee is paid when there is one) */
    public function eligible(AdmissionCycle $c)
    {
        return AdmissionLead::where('cycle_id', $c->id)->whereNotNull('application_no');
    }

    /** sha256 of the sorted application numbers, one per line */
    public static function applicantsHash(array $sortedNos): string
    {
        return hash('sha256', implode("\n", $sortedNos));
    }

    /** a random, unguessable application number, e.g. A27-7K3QF; unique in the institution */
    public function newApplicationNo(): string
    {
        for ($n = 0; $n < 10; $n++) {
            $code = '';
            for ($k = 0; $k < 5; $k++) $code .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
            $no = 'A' . now()->format('y') . '-' . $code;
            if (!AdmissionLead::where('application_no', $no)->exists()) return $no;
        }
        throw new \RuntimeException('could not make a unique application number');
    }

    private function locked(AdmissionCycle $c, string $from): AdmissionCycle
    {
        $c = AdmissionCycle::whereKey($c->id)->lockForUpdate()->firstOrFail();
        if ($c->status !== $from) throw new BusinessException('this step is not allowed now', 'cycle_wrong_state', 422);
        return $c;
    }
}
