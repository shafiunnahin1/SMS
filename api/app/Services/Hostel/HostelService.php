<?php

namespace App\Services\Hostel;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Enrollment, FeeCategory, FeePayment, Hostel, HostelAllocation, HostelRoom, Student};
use App\Support\Money;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

// D233 HST.1 (docs/modules/hostel.md): students in rooms. One active allocation per student; a room change or check-out ends it,
// never deletes it; no allocation over the room's seats; current_occupancy = the room's active allocations; a student whose gender
// is set goes only to a hostel of that type. The room fee is a monthly due in the category 'Hostel fee' (program-specific with no
// structure, so never a general due): the room's monthly_fee each month from the check-in month to the check-out month, once per
// student, settled by what the student paid under that category for the month.
class HostelService
{
    public const FEE_CATEGORY = 'হোস্টেল ফি';

    public function feeCategory(): FeeCategory
    {
        return FeeCategory::firstOrCreate(['name' => self::FEE_CATEGORY], ['amount' => '0.00', 'frequency' => 'monthly', 'applicable_to' => 'program_specific']);
    }

    public function allocate(Student $student, HostelRoom $room, ?string $checkIn = null): HostelAllocation
    {
        $in = Carbon::parse($checkIn ?? now()->toDateString())->toDateString();
        return DB::transaction(function () use ($student, $room, $in) {
            $r = HostelRoom::with('hostel')->lockForUpdate()->findOrFail($room->id);
            $wanted = ['boys' => 'male', 'girls' => 'female'][$r->hostel->type] ?? null;
            if ($student->gender && in_array($student->gender, ['male', 'female'], true) && $student->gender !== $wanted) {
                throw new BusinessException(__('hostel.wrong_type'), 'hostel_wrong_type', 422);
            }
            $current = HostelAllocation::where('student_id', $student->id)->active()->lockForUpdate()->first();
            if ($current && (int) $current->room_id === (int) $r->id) throw new BusinessException(__('hostel.same_room'), 'hostel_same_room', 409);
            if ($current && $current->check_in_date->toDateString() > $in) throw ValidationException::withMessages(['check_in_date' => __('hostel.before_current')]);
            if ($this->occupied($r->id) >= (int) $r->capacity) throw new BusinessException(__('hostel.room_full'), 'room_full', 422);
            if ($current) {
                $current->update(['status' => 'checked_out', 'check_out_date' => $in]);
                $this->recount($current->room_id);
                AuditLog::record('hostel.checked_out', $current);
            }
            $this->feeCategory();
            $row = HostelAllocation::create(['student_id' => $student->id, 'room_id' => $r->id, 'check_in_date' => $in, 'status' => 'active']);
            $this->recount($r->id);
            AuditLog::record('hostel.allocated', $row);
            return $row;
        });
    }

    public function checkout(HostelAllocation $a, ?string $checkOut = null): HostelAllocation
    {
        return DB::transaction(function () use ($a, $checkOut) {
            $row = HostelAllocation::lockForUpdate()->findOrFail($a->id);
            if ($row->status !== 'active') throw new BusinessException(__('hostel.already_out'), 'hostel_already_out', 409);
            $out = Carbon::parse($checkOut ?? now()->toDateString())->toDateString();
            if ($out < $row->check_in_date->toDateString()) throw ValidationException::withMessages(['check_out_date' => __('hostel.out_before_in')]);
            $row->update(['status' => 'checked_out', 'check_out_date' => $out]);
            $this->recount($row->room_id);
            AuditLog::record('hostel.checked_out', $row);
            return $row;
        });
    }

    public function occupied(int $roomId): int
    {
        return HostelAllocation::where('room_id', $roomId)->active()->count();
    }

    /** current_occupancy = the active allocations (never trusted from the client, never drifting) */
    public function recount(int $roomId): void
    {
        HostelRoom::whereKey($roomId)->update(['current_occupancy' => $this->occupied($roomId)]);
    }

    public function syncTotalRooms(int $hostelId): void
    {
        Hostel::whereKey($hostelId)->update(['total_rooms' => HostelRoom::where('hostel_id', $hostelId)->count()]);
    }

    /** D233 HST.4: the students living in a hostel on a date (checked in on or before it, not yet checked out) */
    public function residents(Hostel $h, string $date): Collection
    {
        return HostelAllocation::with(['student.user:id,name', 'room:id,room_number,hostel_id'])->whereIn('room_id', HostelRoom::where('hostel_id', $h->id)->select('id'))
            ->where('check_in_date', '<=', $date)->where(fn ($q) => $q->whereNull('check_out_date')->orWhere('check_out_date', '>', $date))->get()
            ->unique('student_id')->sortBy(fn ($a) => [$a->room?->room_number, $a->student?->user?->name])->values();
    }

    /** the room-fee dues of a student, in FeeService::dueLines shape */
    public function dueLines(Student $s, ?Enrollment $first, FeeCategory $c): Collection
    {
        if (!$first) return collect();
        $rows = HostelAllocation::with('room')->where('student_id', $s->id)->orderBy('check_in_date')->orderBy('id')->get();
        if ($rows->isEmpty()) return collect();
        $lines = collect();
        foreach (range(11, 0) as $back) {
            $period = now()->subMonthsNoOverflow($back)->startOfMonth()->format('Y-m');
            // the allocation that stayed latest in the month (a change inside a month: the new room's fee)
            $row = $rows->filter(fn ($r) => $r->check_in_date->format('Y-m') <= $period && (!$r->check_out_date || $r->check_out_date->format('Y-m') >= $period))->last();
            if (!$row || !$row->room || Money::toPaisa((string) ($row->room->monthly_fee ?? '0')) <= 0) continue;
            $g = Money::toPaisa((string) $row->room->monthly_fee);
            $paid = FeePayment::where('student_id', $s->id)->where('fee_category_id', $c->id)->where('month', $period)->get();
            if ($paid->where('status', 'waived')->isNotEmpty()) continue;
            $payable = $g - $paid->sum(fn ($p) => Money::toPaisa($p->paid_amount));
            if ($payable <= 0) continue;
            $lines->push(['key' => "{$first->id}:{$c->id}:{$period}", 'enrollment_id' => $first->id, 'batch_id' => $first->batch_id,
                'fee_category_id' => $c->id, 'category' => $c->name, 'period' => $period,
                'gross' => Money::format($g), 'discount' => '0.00', 'amount' => Money::format($payable)]);
        }
        return $lines;
    }

    /** what the student and the parent see */
    public function forStudent(Student $s): ?array
    {
        $a = HostelAllocation::with(['room.hostel'])->where('student_id', $s->id)->active()->first();
        if (!$a) return null;
        $h = $a->room?->hostel;
        return ['hostel' => $h?->name, 'type' => $h?->type, 'room_number' => $a->room?->room_number, 'floor' => $a->room?->floor,
            'monthly_fee' => $a->room?->monthly_fee !== null ? (string) $a->room->monthly_fee : null, 'check_in_date' => $a->check_in_date->toDateString(),
            'warden_name' => $h?->warden_name, 'warden_phone' => $h?->warden_phone];
    }
}
