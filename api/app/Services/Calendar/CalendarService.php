<?php

namespace App\Services\Calendar;

use App\Models\{Enrollment, Exam, Holiday, InstitutionEvent, Student, User};
use App\Support\Tenancy;

// D213 CAL.2: one month of the calendar - holidays, exams, events and the weekly holiday. Students and parents see the exams and
// events of their (children's) programs; the public view shows only events marked public for everyone, and no names of people.
class CalendarService
{
    /** programs of a student user or of a parent's children (active enrollments) */
    public function programsOf(User $u): array
    {
        $students = match ($u->role) {
            'student' => Student::where('user_id', $u->id)->pluck('id'),
            'parent' => Student::whereHas('parents', fn ($q) => $q->whereKey($u->id))->pluck('id'),
            default => collect(),
        };
        return $students->isEmpty() ? [] : Enrollment::whereIn('student_id', $students)->where('status', 'active')->distinct()->pluck('program_id')->map(fn ($p) => (int) $p)->all();
    }

    public function month(string $month, ?User $u): array
    {
        $from = $month . '-01';
        $to = date('Y-m-t', strtotime($from));
        $role = $u?->role;
        $programs = $u ? $this->programsOf($u) : [];
        $own = in_array($role, ['student', 'parent'], true);

        $holidays = Holiday::whereBetween('date', [$from, $to])->orderBy('date')->get()
            ->map(fn ($h) => ['date' => $h->date->toDateString(), 'title' => $h->title, 'type' => $h->type])->values();
        $exams = Exam::with('program:id,name')->whereNotNull('start_date')->where('start_date', '<=', $to)->where(fn ($q) => $q->where('end_date', '>=', $from)->orWhere(fn ($w) => $w->whereNull('end_date')->where('start_date', '>=', $from)))
            ->when($own, fn ($q) => $q->whereIn('program_id', $programs ?: [0]))->orderBy('start_date')->get()
            ->map(fn ($e) => ['id' => $e->id, 'name' => $e->name, 'program' => $e->program?->name, 'start_date' => $e->start_date?->toDateString(), 'end_date' => ($e->end_date ?? $e->start_date)?->toDateString()])->values();
        $events = InstitutionEvent::whereBetween('event_date', [$from, $to])
            ->when($u, fn ($q) => $q->for($role, $programs), fn ($q) => $q->where('target_audience', 'all')->where('is_public', true))
            ->orderBy('event_date')->orderBy('start_time')->get()
            ->map(fn ($e) => ['id' => $e->id, 'title' => $e->title, 'type' => $e->type, 'date' => $e->event_date->toDateString(), 'start_time' => $e->start_time ? substr($e->start_time, 0, 5) : null,
                'end_time' => $e->end_time ? substr($e->end_time, 0, 5) : null, 'venue' => $e->venue])->values();
        $weekly = data_get(Tenancy::current()->settings ?? [], 'hr.weekly_holidays');
        return ['month' => $month, 'holidays' => $holidays, 'exams' => $exams, 'events' => $events, 'weekly_holidays' => is_array($weekly) && $weekly ? array_values(array_map('intval', $weekly)) : [5]];
    }
}
