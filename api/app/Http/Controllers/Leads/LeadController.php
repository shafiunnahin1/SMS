<?php

namespace App\Http\Controllers\Leads;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AdmissionLead, AuditLog, Batch, User};
use App\Services\{EnrollmentService, StudentService};
use App\Support\Tenancy;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// D202 PUB.1 (coaching-private-batch.md "Leads"): the list of people who asked about admission and their follow-up. Flow:
// new -> contacted -> visited -> enrolled | lost; `enrolled` only through convert, which admits the Student (and enrols them in
// the chosen batches) with the existing StudentService in one transaction. The list is for the admin and the accountant; every
// change and the conversion are the admin's.
class LeadController extends Controller
{
    private const WITH = ['program:id,name', 'batch:id,name', 'referrer:id,name'];

    public function index(Request $request)
    {
        $f = $request->validate(['status' => ['nullable', Rule::in(['new', 'contacted', 'visited', 'enrolled', 'lost'])], 'follow_up_date' => 'nullable|date_format:Y-m-d', 'page' => 'nullable|integer|min:1',
            'referred_by' => 'nullable|integer|min:1']);   // D203: filter by referrer
        $q = AdmissionLead::with(self::WITH)->when($f['status'] ?? null, fn ($w, $s) => $w->where('status', $s))
            ->when($f['referred_by'] ?? null, fn ($w, $u) => $w->where('referred_by', $u))
            ->when($f['follow_up_date'] ?? null, fn ($w, $d) => $w->whereDate('follow_up_date', $d))->orderByDesc('id');
        $page = $q->paginate(25);
        return response()->json(['success' => true, 'data' => collect($page->items())->map(fn ($l) => $this->row($l))->values(),
            'meta' => ['total' => $page->total(), 'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                // the "today's follow-up" card: open leads whose follow-up is due today
                'follow_up_today' => AdmissionLead::whereIn('status', AdmissionLead::OPEN)->whereDate('follow_up_date', now()->toDateString())->count()]]);
    }

    public function store(Request $request)
    {
        $lead = AdmissionLead::create($this->validated($request) + ['status' => 'new', 'created_by' => $request->user()->id]);
        if ($lead->referred_by) AuditLog::record('lead.referrer_changed', $lead, ['from' => null, 'to' => $lead->referred_by]);   // D203: every referrer change is audited
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($lead->load(self::WITH))], 201);
    }

    public function update(Request $request, int $id)
    {
        $lead = AdmissionLead::findOrFail($id);
        // a converted lead is frozen, except its referrer (D203 (3): the admin may set, change or clear the referrer of any lead)
        if ($lead->status === 'enrolled' && array_diff(array_keys($request->all()), ['referred_by'])) throw new BusinessException('converted', 'lead_converted', 422);
        $v = $this->validated($request, true);
        $from = $lead->referred_by;
        $lead->update($v);
        if (array_key_exists('referred_by', $v) && $from !== $lead->referred_by) AuditLog::record('lead.referrer_changed', $lead, ['from' => $from, 'to' => $lead->referred_by]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($lead->fresh(self::WITH))]);
    }

    public function destroy(int $id)
    {
        $lead = AdmissionLead::findOrFail($id);
        if ($lead->status === 'enrolled') throw new BusinessException('converted', 'lead_converted', 422);   // the admitted student's origin stays on record
        $lead->delete();
        return response()->json(['success' => true, 'message' => __('messages.deleted')]);
    }

    /** POST /leads/{id}/convert { batch_ids: [], ...student fields } - the lead becomes a Student with one enrollment per batch */
    public function convert(Request $request, int $id, StudentService $students, EnrollmentService $enrollments)
    {
        $lead = AdmissionLead::findOrFail($id);
        if ($lead->status === 'enrolled') throw new BusinessException('converted', 'lead_converted', 422);
        $t = Tenancy::current()->id;
        $d = $request->validate([
            'batch_ids' => 'nullable|array|max:10', 'batch_ids.*' => ['integer', 'distinct', Rule::exists('batches', 'id')->where('institution_id', $t)],
            'name' => 'nullable|string|max:100', 'guardian_phone' => ['nullable', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'father_name' => 'nullable|string|max:100', 'mother_name' => 'nullable|string|max:100', 'gender' => 'nullable|in:male,female,other',
            'date_of_birth' => 'nullable|date|before:today', 'address' => 'nullable|string|max:500', 'studying_at' => 'nullable|string|max:150', 'admission_date' => 'nullable|date',
        ]);
        $phone = $d['guardian_phone'] ?? $lead->phone;
        if (!preg_match('/^(?:\+?88)?01[3-9]\d{8}$/', (string) $phone)) throw \Illuminate\Validation\ValidationException::withMessages(['guardian_phone' => __('validation.regex', ['attribute' => 'guardian_phone'])]);
        $profile = array_filter(['name' => $d['name'] ?? $lead->name, 'guardian_phone' => User::normalisePhone($phone), 'guardian_email' => $lead->email,
            'father_name' => $d['father_name'] ?? $lead->guardian_name, 'mother_name' => $d['mother_name'] ?? null, 'gender' => $d['gender'] ?? null,
            'date_of_birth' => $d['date_of_birth'] ?? null, 'address' => $d['address'] ?? null, 'studying_at' => $d['studying_at'] ?? $lead->current_class,
            'admission_date' => $d['admission_date'] ?? null], fn ($v) => $v !== null && $v !== '');
        $batches = Batch::whereIn('id', $d['batch_ids'] ?? [])->orderBy('id')->get();
        $student = DB::transaction(function () use ($lead, $profile, $batches, $students, $enrollments) {
            $student = $students->create($profile, $batches->first());
            foreach ($batches->slice(1) as $b) $enrollments->enroll($student, $b);       // the enrollment rules decide (one batch in a school, several in coaching)
            $lead->update(['status' => 'enrolled', 'converted_student_id' => $student->id]);
            AuditLog::record('lead.converted', $lead, ['student_id' => $student->id]);
            return $student;
        });
        return response()->json(['success' => true, 'message' => __('messages.admitted'), 'data' => $this->row($lead->fresh(self::WITH)) + ['student_code' => $student->student_id]], 201);
    }

    /** D203 (4) GET /leads/referral-summary?from=&to= - per referrer: applications in the period and how many of them were admitted */
    public function referralSummary(Request $request)
    {
        $f = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d|after_or_equal:from']);
        $rows = AdmissionLead::whereNotNull('referred_by')
            ->when($f['from'] ?? null, fn ($w, $d) => $w->where('created_at', '>=', $d . ' 00:00:00'))
            ->when($f['to'] ?? null, fn ($w, $d) => $w->where('created_at', '<=', $d . ' 23:59:59'))
            ->selectRaw("referred_by, COUNT(*) AS applications, SUM(CASE WHEN status = 'enrolled' THEN 1 ELSE 0 END) AS admitted")
            ->groupBy('referred_by')->get();
        $users = User::inTenant()->whereIn('id', $rows->pluck('referred_by'))->get(['id', 'name', 'role'])->keyBy('id');
        $data = $rows->map(fn ($r) => ['user_id' => (int) $r->referred_by, 'name' => $users[$r->referred_by]->name ?? null, 'role' => $users[$r->referred_by]->role ?? null,
            'applications' => (int) $r->applications, 'admitted' => (int) $r->admitted])->sortByDesc('applications')->values();
        return response()->json(['success' => true, 'data' => $data, 'meta' => ['from' => $f['from'] ?? null, 'to' => $f['to'] ?? null,
            'applications' => $data->sum('applications'), 'admitted' => $data->sum('admitted')]]);
    }

    /** D203 (3): active teachers and staff of this institution - the people who may be named as a lead's referrer */
    private function referrerRule(int $t)
    {
        return Rule::exists('users', 'id')->where('institution_id', $t)->whereIn('role', ['teacher', 'institution_staff'])->where('is_active', 1)->whereNull('deleted_at');
    }

    private function validated(Request $request, bool $update = false): array
    {
        $t = Tenancy::current()->id;
        $d = $request->validate([
            'name' => [$update ? 'sometimes' : 'required', 'string', 'max:100'],
            'phone' => [$update ? 'sometimes' : 'required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/'],
            'guardian_name' => 'nullable|string|max:100', 'email' => 'nullable|email|max:100', 'current_class' => 'nullable|string|max:100', 'message' => 'nullable|string|max:500',
            'interested_program_id' => ['nullable', 'integer', Rule::exists('programs', 'id')->where('institution_id', $t)],
            'interested_batch_id' => ['nullable', 'integer', Rule::exists('batches', 'id')->where('institution_id', $t)],
            'source' => ['nullable', Rule::in(AdmissionLead::SOURCES)], 'referred_by' => ['nullable', 'integer', $this->referrerRule($t)], 'follow_up_date' => 'nullable|date_format:Y-m-d', 'note' => 'nullable|string|max:2000',
            // `enrolled` is never set by hand
            'status' => [$update ? 'sometimes' : 'prohibited', Rule::in(['new', 'contacted', 'visited', 'lost'])],
            'converted_student_id' => 'prohibited', 'institution_id' => 'prohibited', 'created_by' => 'prohibited', 'consented_at' => 'prohibited', 'ip_hash' => 'prohibited',
        ]);
        if (isset($d['phone'])) $d['phone'] = User::normalisePhone($d['phone']);
        return $d;
    }

    private function row(AdmissionLead $l): array
    {
        return ['id' => $l->id, 'name' => $l->name, 'phone' => $l->phone, 'guardian_name' => $l->guardian_name, 'email' => $l->email, 'current_class' => $l->current_class,
            'message' => $l->message, 'interested_program_id' => $l->interested_program_id, 'program' => $l->program?->name, 'interested_batch_id' => $l->interested_batch_id,
            'batch' => $l->batch?->name, 'source' => $l->source, 'status' => $l->status, 'follow_up_date' => $l->follow_up_date?->toDateString(), 'note' => $l->note,
            'converted_student_id' => $l->converted_student_id, 'referred_by' => $l->referred_by, 'referrer' => $l->referrer?->name, 'created_at' => $l->created_at?->toIso8601String()];
    }
}
