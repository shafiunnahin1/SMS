<?php

namespace App\Services\Transport;

use App\Exceptions\BusinessException;
use App\Models\{AuditLog, Enrollment, FeeCategory, FeePayment, RouteStop, Student, StudentTransport, TransportRoute};
use App\Support\Money;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

// D229 TRN.1 (docs/modules/transport.md): students on routes. One active row per student; a change of route or leaving ends the
// row (ended_on), never deletes it. The transport fee is a monthly due in the category 'Transport fee' (program-specific with no
// structure, so it is never a general due): each month from the start month to the end month the route's monthly_fee, once per
// student (on the student's first active enrollment), settled by what was paid under that category and month for the student.
class TransportService
{
    public const FEE_CATEGORY = 'পরিবহন ফি';

    public function feeCategory(): FeeCategory
    {
        return FeeCategory::firstOrCreate(['name' => self::FEE_CATEGORY], ['amount' => '0.00', 'frequency' => 'monthly', 'applicable_to' => 'program_specific']);
    }

    public function assign(Student $student, TransportRoute $route, ?RouteStop $stop, string $direction, ?string $startedOn = null): StudentTransport
    {
        if ($stop && (int) $stop->route_id !== (int) $route->id) throw \Illuminate\Validation\ValidationException::withMessages(['stop_id' => __('transport.stop_not_on_route')]);
        $start = Carbon::parse($startedOn ?? now()->toDateString())->toDateString();
        return DB::transaction(function () use ($student, $route, $stop, $direction, $start) {
            $r = TransportRoute::with('vehicle')->lockForUpdate()->findOrFail($route->id);
            $current = StudentTransport::where('student_id', $student->id)->active()->lockForUpdate()->first();
            if ($current && $current->started_on->toDateString() > $start) throw \Illuminate\Validation\ValidationException::withMessages(['started_on' => __('transport.before_current')]);
            $riders = StudentTransport::where('route_id', $r->id)->active()->where('student_id', '!=', $student->id)->count();
            if ($r->vehicle && $riders + 1 > (int) $r->vehicle->capacity) throw new BusinessException(__('transport.full', ['n' => $r->vehicle->capacity]), 'route_full', 422);
            if ($current) {
                $current->update(['ended_on' => $start]);
                AuditLog::record('transport.ended', $current);
            }
            $this->feeCategory();
            $row = StudentTransport::create(['student_id' => $student->id, 'route_id' => $r->id, 'stop_id' => $stop?->id, 'direction' => $direction, 'started_on' => $start]);
            AuditLog::record('transport.assigned', $row);
            return $row;
        });
    }

    public function unassign(Student $student, ?string $endedOn = null): StudentTransport
    {
        return DB::transaction(function () use ($student, $endedOn) {
            $row = StudentTransport::where('student_id', $student->id)->active()->lockForUpdate()->first();
            if (!$row) throw new BusinessException(__('transport.not_assigned'), 'not_assigned', 404);
            $end = Carbon::parse($endedOn ?? now()->toDateString())->toDateString();
            if ($end < $row->started_on->toDateString()) throw \Illuminate\Validation\ValidationException::withMessages(['ended_on' => __('transport.end_before_start')]);
            $row->update(['ended_on' => $end]);
            AuditLog::record('transport.ended', $row);
            return $row;
        });
    }

    /** The transport dues of a student, in FeeService::dueLines shape; none when the student has no transport or no enrollment */
    public function dueLines(Student $s, ?Enrollment $first, FeeCategory $c): Collection
    {
        if (!$first) return collect();
        $rows = StudentTransport::with('route')->where('student_id', $s->id)->orderBy('started_on')->orderBy('id')->get();
        if ($rows->isEmpty()) return collect();
        $lines = collect();
        foreach (range(11, 0) as $back) {
            $m = now()->subMonthsNoOverflow($back)->startOfMonth();
            $period = $m->format('Y-m');
            // the row riding latest in the month (a change inside a month: the new route's fee for that month)
            $row = $rows->filter(fn ($r) => $r->started_on->format('Y-m') <= $period && (!$r->ended_on || $r->ended_on->format('Y-m') >= $period))->last();
            if (!$row || !$row->route || Money::toPaisa((string) ($row->route->monthly_fee ?? '0')) <= 0) continue;
            $g = Money::toPaisa((string) $row->route->monthly_fee);
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

    /** what a student or parent sees */
    public function forStudent(Student $s): ?array
    {
        $a = StudentTransport::with(['route.vehicle', 'stop'])->where('student_id', $s->id)->active()->first();
        if (!$a) return null;
        $v = $a->route?->vehicle;
        return ['route' => $a->route?->name, 'morning_departure' => $a->route?->morning_departure, 'afternoon_departure' => $a->route?->afternoon_departure,
            'monthly_fee' => $a->route?->monthly_fee !== null ? (string) $a->route->monthly_fee : null,
            'vehicle' => $v?->name, 'number_plate' => $v?->number_plate, 'driver_name' => $v?->driver_name, 'driver_phone' => $v?->driver_phone, 'helper_name' => $v?->helper_name,
            'stop' => $a->stop?->stop_name, 'pickup_time' => $a->stop?->pickup_time, 'drop_time' => $a->stop?->drop_time, 'direction' => $a->direction, 'started_on' => $a->started_on->toDateString()];
    }
}
