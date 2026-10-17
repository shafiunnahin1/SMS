<?php

namespace App\Services\Hr;

use App\Models\{LeaveApplication, StaffAttendance, StaffMember, Teacher, TeacherAttendance};
use Carbon\CarbonImmutable;

class AttendanceSummary
{
    public function __construct(private HrCalendar $calendar, private LeaveService $leaves) {}

    public function forPayee(string $type, int $id, string $month): array
    {
        if (!in_array($type, ['teacher','staff'], true)) abort(422);
        $payee = $type === 'teacher' ? Teacher::findOrFail($id) : StaffMember::findOrFail($id);
        $start = CarbonImmutable::createFromFormat('!Y-m', $month)->startOfMonth();
        $end = $start->endOfMonth();
        if ($payee->joining_date && $payee->joining_date->gt($start)) $start = CarbonImmutable::parse($payee->joining_date);
        if ($payee->leaving_date && $payee->leaving_date->lt($end)) $end = CarbonImmutable::parse($payee->leaving_date);
        $result = array_fill_keys(['working_days','present_days','absent_days','leave_days','lwp_days','late_count'], 0);
        if ($start->gt($end)) return $result;
        $from = $start->toDateString(); $to = $end->toDateString();
        $approved = LeaveApplication::where('status', 'approved')->where($type === 'teacher' ? 'user_id' : 'staff_id', $type === 'teacher' ? $payee->user_id : $payee->id)
            ->where('from_date', '<=', $to)->where('to_date', '>=', $from)->get();
        $leaveDates = [];
        foreach ($approved as $leave) {
            $snapshot = $this->leaves->snapshot($leave);
            foreach ($snapshot['dates'] as $date) if ($date >= $from && $date <= $to) $leaveDates[$date] = $snapshot['is_paid'];
        }
        $dates = array_unique([...$this->calendar->dates($from, $to), ...array_keys($leaveDates)]);
        $model = $type === 'teacher' ? TeacherAttendance::class : StaffAttendance::class;
        $marks = $model::where($type.'_id', $id)->whereBetween('date', [$from,$to])->get()->keyBy(fn ($row) => $row->date->toDateString());
        foreach ($dates as $date) {
            $result['working_days']++;
            if (array_key_exists($date, $leaveDates)) {
                $result['leave_days']++; if (!$leaveDates[$date]) $result['lwp_days']++;
            } elseif (in_array($marks->get($date)?->status, ['present','late'], true)) {
                $result['present_days']++; if ($marks->get($date)->status === 'late') $result['late_count']++;
            } else $result['absent_days']++;
        }
        return $result;
    }
}
