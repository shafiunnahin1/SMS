<?php

namespace App\Services\Substitution;

use App\Exceptions\BusinessException;
use App\Models\Institution;
use App\Support\Tenancy;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

// D200 SUBL.2 (routine.md D96 "shared writer-lock protocol", API.md D199 retries): every writer of routines, blocks, teachers,
// batches, subjects, programs, leaves and dated period attendance takes the tenant institution row FIRST inside its transaction.
// A MySQL deadlock (1213) or lock wait timeout (1205) reruns the WHOLE transaction, at most 3 attempts, then 409
// substitution_retry_required with nothing written. Inside an outer transaction it runs in a savepoint and does not retry (the outer owner does).
class InstitutionLock
{
    public const RETRYABLE = [1213, 1205];
    public const ATTEMPTS = 3;

    public function run(\Closure $work): mixed
    {
        $locked = function () use ($work) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            return $work();
        };
        if (DB::transactionLevel() > 0) return DB::transaction($locked);   // a savepoint: a failure still undoes this writer's partial work
        return $this->retrying(fn () => DB::transaction($locked));
    }

    /** @param \Closure $attempt one complete transaction */
    public function retrying(\Closure $attempt): mixed
    {
        for ($n = 1; ; $n++) {
            try {
                return $attempt();
            } catch (QueryException $e) {
                if (!in_array((int) ($e->errorInfo[1] ?? 0), self::RETRYABLE, true)) throw $e;
                if ($n >= self::ATTEMPTS) throw new BusinessException('retry required', 'substitution_retry_required', 409);
            }
        }
    }
}
