<?php

namespace App\Http\Controllers\Shared;

use App\Http\Controllers\Controller;
use App\Models\{Attendance, Batch, Exam, ExamSubject, FeePayment, Institution, Result, Student, Teacher};
use App\Services\{AcademicStructureService, ExamService, FeeService, InstitutionSettings, SmsService};
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;

// Step 4.7 (docs/modules/panels-and-features.md "6 Panels"): one summary per role, R1 data only. Every number is a handful of
// aggregate queries - no per-student loops except the parent's own children. Dues across ALL students are not summed here
// (costly, IDEAS 2026-10-06); the admin sees the month's collection instead.
class DashboardController extends Controller
{
    /** GET /super/dashboard (central host, super_admin): institutions by status and type, new sign-ups, expiring soon */
    public function superAdmin()
    {
        $byStatus = Institution::selectRaw('status, COUNT(*) AS n')->groupBy('status')->pluck('n', 'status');
        return response()->json(['success' => true, 'data' => [
            'institutions' => ['total' => (int) $byStatus->sum(), 'by_status' => collect(['active', 'trial', 'expired', 'suspended', 'inactive'])
                ->mapWithKeys(fn ($s) => [$s => (int) ($byStatus[$s] ?? 0)])],
            'by_type' => Institution::selectRaw('institution_type AS type, COUNT(*) AS n')->groupBy('institution_type')->pluck('n', 'type')->map(fn ($n) => (int) $n),
            'signups_30_days' => Institution::where('created_at', '>=', now()->subDays(30))->count(),
            'expiring_7_days' => Institution::whereBetween('subscription_expires_at', [now(), now()->addDays(7)])->orderBy('subscription_expires_at')
                ->limit(20)->get(['id', 'name', 'slug', 'subscription_expires_at'])
                ->map(fn ($i) => ['id' => $i->id, 'name' => $i->name, 'slug' => $i->slug, 'expires_at' => $i->subscription_expires_at?->toIso8601String()]),
            // revenue / payments: platform billing is Step 5.1/5.2 (blocked, D47) - nothing to show yet
        ]]);
    }

    /** GET /admin/dashboard */
    public function admin(SmsService $sms)
    {
        $today = now()->toDateString();
        $att = Attendance::where('date', $today)->selectRaw('status, COUNT(*) AS n')->groupBy('status')->pluck('n', 'status');
        $runningBatches = Batch::whereIn('status', ['upcoming', 'running']);
        return response()->json(['success' => true, 'data' => [
            'students' => Student::where('status', 'active')->count(),
            'teachers' => Teacher::count(),
            'batches' => (clone $runningBatches)->count(),
            'attendance_today' => ['present' => (int) ($att['present'] ?? 0) + (int) ($att['late'] ?? 0), 'absent' => (int) ($att['absent'] ?? 0),
                'leave' => (int) ($att['leave'] ?? 0), 'batches_taken' => Attendance::where('date', $today)->distinct()->count('batch_id'),
                'batches_total' => (clone $runningBatches)->count()],
            'collection' => $this->collection(),
            'exams_open' => Exam::where('status', '!=', 'published')->count(),
            'sms_balance' => $sms->usage(Tenancy::current())['balance'],
        ]]);
    }

    /** GET /accountant/dashboard */
    public function accountant()
    {
        $recent = FeePayment::selectRaw('receipt_no, MIN(id) AS id, student_id, MAX(paid_at) AS paid_at, SUM(paid_amount) AS total')
            ->groupBy('receipt_no', 'student_id')->orderByDesc('paid_at')->limit(5)->with('student.user:id,name')->get();
        return response()->json(['success' => true, 'data' => [
            'collection' => $this->collection(),
            'recent_receipts' => $recent->map(fn ($r) => ['id' => (int) $r->id, 'receipt_no' => $r->receipt_no, 'student' => $r->student?->user?->name,
                'total' => Money::format(Money::toPaisa((string) $r->total)), 'paid_at' => $r->paid_at ? \Illuminate\Support\Carbon::parse($r->paid_at)->toIso8601String() : null])->values(),
        ]]);
    }

    /** GET /teacher/dashboard: my batches with today's attendance state, and exams waiting for my marks */
    public function teacher(Request $request, AcademicStructureService $academic, ExamService $exams)
    {
        if ($request->user()?->role === 'institution_staff') {
            // D101: department staff reach their own Teacher dashboard only with D91 context + staff.dashboard.teacher and exactly one active linked Teacher
            app(\App\Services\DepartmentRequestContextService::class)->forRoute($request);
            $profiles = Teacher::where('user_id', $request->user()->id)->where('status', 'active')->limit(2)->get();
            if ($profiles->count() !== 1) throw new \Illuminate\Auth\Access\AuthorizationException();
            $teacher = $profiles->first();
        } else {
            $teacher = Teacher::where('user_id', $request->user()->id)->first();
        }
        $batches = $teacher ? $academic->batchesOf($teacher) : collect();
        $taken = Attendance::where('date', now()->toDateString())->whereIn('batch_id', $batches->pluck('id'))->distinct()->pluck('batch_id')->map(fn ($v) => (int) $v)->all();
        $pending = Exam::where('status', '!=', 'published')->orderByDesc('id')->get()->flatMap(fn ($exam) => ExamSubject::where('exam_id', $exam->id)->with('subject:id,name')->get()
            ->filter(fn ($es) => $exams->batchesFor($request->user(), $exam, $es->subject_id) !== [])
            ->map(fn ($es) => ['exam_id' => $exam->id, 'exam' => $exam->name, 'subject_id' => $es->subject_id, 'subject' => $es->subject?->name]))->values();
        return response()->json(['success' => true, 'data' => [
            'batches' => $batches->map(fn ($b) => ['id' => $b->id, 'name' => $b->name, 'program' => $b->program?->name,
                'is_class_teacher' => $teacher && (int) $b->teacher_id === $teacher->id, 'attendance_taken' => in_array($b->id, $taken, true)])->values(),
            'marks_pending' => $pending->take(10),
        ]]);
    }

    /** GET /parent/dashboard: per child - this month's attendance, dues, the latest published result */
    public function parent(Request $request, FeeService $fees, ExamService $exams)
    {
        $useGpa = app(InstitutionSettings::class)->general(Tenancy::current())['use_gpa'];
        $month = now()->format('Y-m');
        $children = Student::whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))->with(['user:id,name', 'batch:id,name'])->orderBy('id')->get();
        return response()->json(['success' => true, 'data' => $children->map(function ($s) use ($fees, $exams, $useGpa, $month) {
            $att = Attendance::where('student_id', $s->id)->whereBetween('date', [$month . '-01', date('Y-m-t', strtotime($month . '-01'))])->selectRaw('status, COUNT(*) AS n')->groupBy('status')->pluck('n', 'status');
            $days = (int) $att->sum();
            $dues = $fees->dueLines($s);
            $latest = Exam::where('status', 'published')->whereIn('id', Result::where('student_id', $s->id)->select('exam_id'))->orderByDesc('id')->first();
            $sheet = $latest ? $exams->sheet($latest, $s, $useGpa) : null;
            return ['id' => $s->id, 'name' => $s->user?->name, 'batch' => $s->batch?->name,
                'attendance' => ['month' => $month, 'days' => $days, 'absent' => (int) ($att['absent'] ?? 0),
                    'percentage' => $days ? round(((int) ($att['present'] ?? 0)) / $days * 100, 2) : null],
                'dues' => ['count' => $dues->count(), 'total' => Money::format($dues->sum(fn ($l) => Money::toPaisa($l['amount'])))],
                'latest_result' => $sheet ? ['exam' => $sheet['exam']['name'], 'percentage' => $sheet['total']['percentage'], 'gpa' => $sheet['total']['gpa'], 'is_pass' => $sheet['total']['is_pass']] : null];
        })->values()]);
    }

    public function parentChildren(Request $request)
    {
        $children = Student::whereHas('parents', fn ($q) => $q->whereKey($request->user()->id))
            ->with(['user:id,name', 'program:id,name', 'batch:id,name'])->orderBy('id')->get()
            ->map(fn ($s) => ['id' => $s->id, 'student_id' => $s->student_id, 'name' => $s->user?->name,
                'program' => $s->program?->name, 'batch' => $s->batch?->name, 'roll_no' => $s->roll_no]);

        return response()->json(['success' => true, 'data' => $children]);
    }

    /** Today's and this month's money in (by paid_at) */
    private function collection(): array
    {
        $sum = fn ($from) => Money::format(Money::toPaisa((string) (FeePayment::where('paid_at', '>=', $from)->sum('paid_amount') ?: '0')));
        return ['today' => $sum(now()->startOfDay()), 'month' => $sum(now()->startOfMonth()),
            'receipts_today' => FeePayment::where('paid_at', '>=', now()->startOfDay())->distinct()->count('receipt_no')];
    }
}
