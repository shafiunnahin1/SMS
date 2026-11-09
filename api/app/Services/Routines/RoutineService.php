<?php

namespace App\Services\Routines;

use App\Exceptions\BusinessException;
use App\Models\{Institution, Routine, RoutineBlock};
use App\Support\Tenancy;
use Illuminate\Support\Facades\DB;

// D193 RTN.1 (routine.md "Conflict Detection Logic", corrected by the D96 rules in the same file): every routine writer takes the
// tenant institution row lock first; the overlap is strict (start < other.end AND end > other.start, back-to-back periods are
// fine); the slot being edited is excluded by its own model id, never by an id from the request. Three conflicts are refused with
// 422 routine_conflict: the same teacher, the same class (program + batch; a whole-program slot clashes with every batch of it),
// and the same room - each on the same day.
class RoutineService
{
    public function save(array $data, ?Routine $routine = null): Routine
    {
        return DB::transaction(function () use ($data, $routine) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            if ($routine) $routine = Routine::whereKey($routine->id)->lockForUpdate()->firstOrFail();
            $conflicts = $this->conflicts($data, $routine?->id);
            if ($conflicts) {
                $list = implode(', ', array_map(fn ($c) => __("errors.routine_conflicts.$c"), $conflicts));
                throw new BusinessException('routine conflict: ' . implode(',', $conflicts), 'routine_conflict', 422, ['list' => $list]);
            }
            if ($routine) { $routine->update($data); return $routine->fresh(); }
            return Routine::create($data);
        });
    }

    public function delete(Routine $routine): void
    {
        DB::transaction(function () use ($routine) {
            Institution::whereKey(Tenancy::current()->id)->lockForUpdate()->firstOrFail();
            Routine::whereKey($routine->id)->lockForUpdate()->firstOrFail()->delete();
        });
    }

    /** @return string[] teacher | class | room | block (D197 AAD.5: a fixed break / assembly / prayer block of the program on that day) */
    public function conflicts(array $d, ?int $exceptId = null): array
    {
        $base = fn () => Routine::where('day_of_week', $d['day_of_week'])->where('start_time', '<', $d['end_time'])->where('end_time', '>', $d['start_time'])
            ->when($exceptId, fn ($q) => $q->whereKeyNot($exceptId));
        $out = [];
        if ($base()->where('teacher_id', $d['teacher_id'])->exists()) $out[] = 'teacher';
        $batch = $d['batch_id'] ?? null;
        if ($base()->where('program_id', $d['program_id'])->when($batch, fn ($q) => $q->where(fn ($w) => $w->whereNull('batch_id')->orWhere('batch_id', $batch)))->exists()) $out[] = 'class';
        if (!empty($d['room_no']) && $base()->where('room_no', $d['room_no'])->exists()) $out[] = 'room';
        if (RoutineBlock::for((int) $d['program_id'], $d['day_of_week'])->where('start_time', '<', $d['end_time'])->where('end_time', '>', $d['start_time'])->exists()) $out[] = 'block';
        return $out;
    }
}
