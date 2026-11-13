<?php

namespace App\Services\Admission;

use App\Exceptions\BusinessException;
use App\Models\{AdmissionCycle, AdmissionDraw, AdmissionLead, AuditLog};
use App\Support\Money;
use Illuminate\Support\Facades\DB;

// D209 ACY.3 (docs/modules/admission-cycle.md sections 2-3): test marks, the merit list and the verifiable lottery. Both lists move
// the cycle testing -> listing and write merit_rank (the order) and list_status (selected | waiting | rejected).
class AdmissionListService
{
    public const ALGORITHM = 'hmac-sha256/v1';

    /** the order of a lottery: application_no sorted by hex(HMAC-SHA256(key = the 32 seed bytes, message = application_no)), smallest first */
    public static function lotteryOrder(string $seedHex, array $nos): array
    {
        $key = hex2bin($seedHex);
        $tagged = array_map(fn ($no) => [hash_hmac('sha256', $no, $key), $no], $nos);
        usort($tagged, fn ($a, $b) => strcmp($a[0], $b[0]) ?: strcmp($a[1], $b[1]));
        return array_column($tagged, 1);
    }

    /** merit order: higher marks first; equal marks - the earlier application (smaller id) first */
    public static function meritOrder(array $rows): array
    {
        usort($rows, fn ($a, $b) => (Money::toPaisa((string) $b['marks']) <=> Money::toPaisa((string) $a['marks'])) ?: ($a['id'] <=> $b['id']));
        return array_column($rows, 'id');
    }

    /** marks only while testing, only for applications that sat the test (have a roll) */
    public function saveMarks(AdmissionCycle $c, array $rows): int
    {
        return DB::transaction(function () use ($c, $rows) {
            $c = $this->locked($c, 'testing');
            $byNo = AdmissionLead::where('cycle_id', $c->id)->whereNotNull('test_roll')->whereIn('application_no', array_column($rows, 'application_no'))->get()->keyBy('application_no');
            $unknown = array_values(array_diff(array_column($rows, 'application_no'), $byNo->keys()->all()));
            if ($unknown) throw \Illuminate\Validation\ValidationException::withMessages(['rows' => __('errors.unknown_application', ['list' => implode(', ', array_slice($unknown, 0, 5))])]);
            foreach ($rows as $r) $byNo[$r['application_no']]->update(['test_marks' => $r['marks'] === null ? null : Money::format(Money::toPaisa((string) $r['marks']))]);
            AuditLog::record('admission_cycle.marks_saved', $c, ['rows' => count($rows)]);
            return count($rows);
        });
    }

    public function merit(AdmissionCycle $c, int $by): AdmissionCycle
    {
        return DB::transaction(function () use ($c, $by) {
            $c = $this->locked($c, 'testing');
            if (($c->rule['mode'] ?? 'merit') !== 'merit') throw new BusinessException('this cycle uses a lottery', 'cycle_wrong_mode', 422);
            $min = $c->rule['min_marks'] ?? null;
            $sat = AdmissionLead::where('cycle_id', $c->id)->whereNotNull('test_roll')->get();
            $ranked = $sat->filter(fn ($l) => $l->test_marks !== null && ($min === null || Money::toPaisa((string) $l->test_marks) >= Money::toPaisa((string) $min)))
                ->map(fn ($l) => ['id' => $l->id, 'marks' => $l->test_marks])->values()->all();
            $order = self::meritOrder($ranked);
            $this->apply($c, $order, $sat->pluck('id')->all());
            AuditLog::record('admission_cycle.merit_list', $c, ['ranked' => count($order)]);
            return $c;
        });
    }

    public function lottery(AdmissionCycle $c, string $seedHex, int $by): AdmissionCycle
    {
        return DB::transaction(function () use ($c, $seedHex, $by) {
            $c = $this->locked($c, 'testing');
            if (($c->rule['mode'] ?? 'merit') !== 'lottery') throw new BusinessException('this cycle uses the merit list', 'cycle_wrong_mode', 422);
            $draw = AdmissionDraw::where('cycle_id', $c->id)->lockForUpdate()->firstOrFail();
            $seedHex = strtolower(trim($seedHex));
            if (!preg_match('/^[0-9a-f]{64}$/', $seedHex) || !hash_equals($draw->seed_commitment, hash('sha256', hex2bin($seedHex)))) {
                throw new BusinessException('the seed does not match the published commitment', 'seed_mismatch', 422);
            }
            $sat = AdmissionLead::where('cycle_id', $c->id)->whereNotNull('test_roll')->get();
            $nos = $sat->pluck('application_no')->sort(SORT_STRING)->values()->all();
            $hash = AdmissionCycleService::applicantsHash($nos);
            if (!hash_equals((string) ($draw->result['applicants_hash'] ?? ''), $hash)) throw new BusinessException('the applicants changed after the freeze', 'applicants_changed', 422);
            $orderNos = self::lotteryOrder($seedHex, $nos);
            $idByNo = $sat->pluck('id', 'application_no');
            [$selected, $waiting] = $this->apply($c, array_map(fn ($no) => $idByNo[$no], $orderNos), $sat->pluck('id')->all());
            $noById = $sat->pluck('application_no', 'id');
            $draw->update(['seed_reveal' => $seedHex, 'drawn_by' => $by, 'drawn_at' => now(), 'applicants_count' => count($nos),
                'result' => array_merge($draw->result ?? [], ['order' => $orderNos, 'selected' => array_map(fn ($id) => $noById[$id], $selected),
                    'waiting' => array_map(fn ($id) => $noById[$id], $waiting), 'applicants_hash' => $hash, 'algorithm' => self::ALGORITHM,
                    'guarantee' => $draw->result['guarantee'] ?? 'strong'])]);
            AuditLog::record('admission_cycle.lottery', $c, ['applicants' => count($nos)]);   // the seed is public now, but kept out of the audit anyway
            return $c;
        });
    }

    /** the seed was lost: a new commitment after the freeze - marked as the weaker guarantee everywhere. Returns the new seed once. */
    public function recommit(AdmissionCycle $c): string
    {
        return DB::transaction(function () use ($c) {
            $c = $this->locked($c, 'testing');
            if (($c->rule['mode'] ?? 'merit') !== 'lottery') throw new BusinessException('this cycle uses the merit list', 'cycle_wrong_mode', 422);
            $draw = AdmissionDraw::where('cycle_id', $c->id)->lockForUpdate()->firstOrFail();
            $bytes = random_bytes(32);
            $draw->update(['seed_commitment' => hash('sha256', $bytes), 'result' => array_merge($draw->result ?? [], ['guarantee' => 'weaker'])]);
            AuditLog::record('admission_cycle.recommitted', $c, ['guarantee' => 'weaker']);
            return bin2hex($bytes);
        });
    }

    /** first `seats` selected, next `waiting` waiting, every other applicant who sat the test rejected; testing -> listing */
    private function apply(AdmissionCycle $c, array $orderIds, array $allIds): array
    {
        $seats = (int) $c->seats;
        $wait = (int) ($c->rule['waiting'] ?? 0);
        $selected = array_slice($orderIds, 0, $seats);
        $waiting = array_slice($orderIds, $seats, $wait);
        // ACY.4: a selected applicant gets a confirmation deadline (follow_up_date = today + confirm_within_days)
        $deadline = now()->addDays((int) ($c->rule['confirm_within_days'] ?? 7))->toDateString();
        foreach ($orderIds as $n => $id) {
            AdmissionLead::whereKey($id)->update(['merit_rank' => $n + 1, 'list_status' => $n < $seats ? 'selected' : ($n < $seats + $wait ? 'waiting' : 'rejected'),
                'follow_up_date' => $n < $seats ? $deadline : null]);
        }
        $unranked = array_diff($allIds, $orderIds);
        if ($unranked) AdmissionLead::whereIn('id', $unranked)->update(['merit_rank' => null, 'list_status' => 'rejected']);
        $c->update(['status' => 'listing']);
        return [$selected, $waiting];
    }

    private function locked(AdmissionCycle $c, string $from): AdmissionCycle
    {
        $c = AdmissionCycle::whereKey($c->id)->lockForUpdate()->firstOrFail();
        if ($c->status !== $from) throw new BusinessException('this step is not allowed now', 'cycle_wrong_state', 422);
        return $c;
    }
}
