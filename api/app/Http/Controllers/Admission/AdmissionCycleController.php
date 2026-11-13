<?php

namespace App\Http\Controllers\Admission;

use App\Exceptions\BusinessException;
use App\Http\Controllers\Controller;
use App\Models\{AdmissionCycle, AuditLog};
use App\Services\Admission\AdmissionCycleService;
use App\Support\{Money, Tenancy};
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// D209 ACY.1 (docs/modules/admission-cycle.md section 5): the admin's admission cycles. Setup is edited only in `draft`;
// open / freeze / close move the state one step (AdmissionCycleService). The lottery seed is in the open response only.
class AdmissionCycleController extends Controller
{
    public function __construct(private AdmissionCycleService $cycles) {}

    public function index()
    {
        $rows = AdmissionCycle::with('program:id,name')->withCount('leads')->orderByDesc('id')->get();
        return response()->json(['success' => true, 'data' => $rows->map(fn ($c) => $this->row($c))->values()]);
    }

    public function show(int $id)
    {
        $c = AdmissionCycle::with(['program:id,name', 'draw'])->withCount('leads')->findOrFail($id);
        return response()->json(['success' => true, 'data' => $this->row($c, true)]);
    }

    public function store(Request $request)
    {
        $c = AdmissionCycle::create($this->validated($request) + ['status' => 'draft']);
        AuditLog::record('admission_cycle.created', $c);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($c->load('program:id,name')->loadCount('leads'))], 201);
    }

    public function update(Request $request, int $id)
    {
        $c = AdmissionCycle::findOrFail($id);
        if ($c->status !== 'draft') throw new BusinessException('only a draft cycle can be edited', 'cycle_not_draft', 422);
        $c->update($this->validated($request));
        AuditLog::record('admission_cycle.updated', $c);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($c->fresh('program:id,name')->loadCount('leads'))]);
    }

    public function open(int $id)
    {
        $c = AdmissionCycle::findOrFail($id);
        $seed = $this->cycles->open($c);
        return response()->json(['success' => true, 'data' => $this->row($c->fresh(['program:id,name', 'draw'])->loadCount('leads'), true) + ['seed' => $seed]]);
    }

    public function freeze(int $id)
    {
        $c = $this->cycles->freeze(AdmissionCycle::findOrFail($id));
        return response()->json(['success' => true, 'data' => $this->row($c->fresh(['program:id,name', 'draw'])->loadCount('leads'), true)]);
    }

    public function close(int $id)
    {
        $c = $this->cycles->close(AdmissionCycle::findOrFail($id));
        return response()->json(['success' => true, 'data' => $this->row($c->fresh(['program:id,name', 'draw'])->loadCount('leads'), true)]);
    }

    private function validated(Request $request): array
    {
        $t = Tenancy::current()->id;
        $d = $request->validate([
            'name' => 'required|string|max:120',
            'program_id' => ['required', 'integer', Rule::exists('programs', 'id')->where('institution_id', $t)],
            'academic_year_id' => ['nullable', 'integer', Rule::exists('academic_years', 'id')->where('institution_id', $t)],
            'seats' => 'required|integer|min:1|max:100000',
            'apply_from' => 'required|date_format:Y-m-d', 'apply_until' => 'required|date_format:Y-m-d|after_or_equal:apply_from',
            'test_date' => 'nullable|date_format:Y-m-d|after_or_equal:apply_from',
            'application_fee' => 'required|numeric|min:0|max:100000|decimal:0,2',
            'rule' => 'required|array',
            'rule.mode' => 'required|in:merit,lottery',
            'rule.waiting' => 'nullable|integer|min:0|max:100000',
            'rule.min_marks' => 'nullable|numeric|min:0|max:9999',
            'rule.confirm_within_days' => 'nullable|integer|min:1|max:60',
            'rule.publish_names' => 'nullable|boolean',
        ]);
        $d['rule'] = $this->cycles->rule($d['rule']);
        $d['application_fee'] = Money::format(Money::toPaisa((string) $d['application_fee']));   // G9: never a float
        return $d;
    }

    private function row(AdmissionCycle $c, bool $full = false): array
    {
        $r = ['id' => $c->id, 'name' => $c->name, 'program' => $c->program ? ['id' => $c->program->id, 'name' => $c->program->name] : null,
            'academic_year_id' => $c->academic_year_id, 'seats' => $c->seats, 'apply_from' => $c->apply_from?->toDateString(), 'apply_until' => $c->apply_until?->toDateString(),
            'test_date' => $c->test_date?->toDateString(), 'application_fee' => $c->application_fee, 'status' => $c->status, 'rule' => $c->rule,
            'applications' => $c->leads_count ?? null, 'accepting' => $c->accepting()];
        if ($full) $r['draw'] = $c->draw ? ['seed_commitment' => $c->draw->seed_commitment, 'applicants_count' => $c->draw->applicants_count,
            'applicants_hash' => $c->draw->result['applicants_hash'] ?? null] : null;
        return $r;
    }
}
