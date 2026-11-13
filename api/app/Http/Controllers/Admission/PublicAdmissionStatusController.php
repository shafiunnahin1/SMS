<?php

namespace App\Http\Controllers\Admission;

use App\Http\Controllers\Controller;
use App\Models\{AdmissionCycle, AdmissionLead, User};
use App\Services\Admission\AdmissionFeeService;
use Illuminate\Http\Request;

// D209 ACY.5 (docs/modules/admission-cycle.md section 4): on the institution's public site, no login -
// GET /public/admission/status?application_no=&phone= : one applicant's own state and next step; BOTH must match (any mismatch is
// the same 404, so numbers cannot be probed), throttled; never a name or anyone else.
// GET /public/admission/cycles : the published cycles (not drafts) with their dates and a link to each public record.
class PublicAdmissionStatusController extends Controller
{
    public function status(Request $request, AdmissionFeeService $fees)
    {
        $d = $request->validate(['application_no' => 'required|string|max:20', 'phone' => ['required', 'string', 'regex:/^(?:\+?88)?01[3-9]\d{8}$/']]);
        $lead = AdmissionLead::where('application_no', strtoupper(trim($d['application_no'])))->where('phone', User::normalisePhone($d['phone']))->whereNotNull('cycle_id')->first();
        $c = $lead ? AdmissionCycle::find($lead->cycle_id) : null;
        if (!$lead || !$c) return response()->json(['success' => false, 'error' => 'application_not_found', 'message' => __('errors.application_not_found')], 404);
        $paid = $fees->isPaid($lead, $c);
        $step = match (true) {
            $lead->list_status === 'admitted' => 'admitted',
            $lead->list_status === 'selected' => $lead->follow_up_date ? 'confirm' : 'come_to_admit',
            in_array($lead->list_status, ['waiting', 'rejected', 'declined'], true) => $lead->list_status,
            $c->status === 'open' => $paid ? 'wait_for_test' : 'pay_fee',
            $c->status === 'testing' => $lead->test_roll ? 'sit_test' : 'not_eligible',
            default => 'wait_for_list',
        };
        return response()->json(['success' => true, 'data' => [
            'application_no' => $lead->application_no, 'cycle' => ['id' => $c->id, 'name' => $c->name, 'status' => $c->status, 'test_date' => $c->test_date?->toDateString()],
            'fee' => $c->application_fee, 'paid' => $paid, 'test_roll' => $lead->test_roll, 'merit_rank' => $lead->merit_rank, 'list_status' => $lead->list_status,
            'confirm_by' => $lead->list_status === 'selected' ? $lead->follow_up_date?->toDateString() : null, 'next_step' => $step,
        ]]);
    }

    public function cycles()
    {
        $rows = AdmissionCycle::with('program:id,name')->whereIn('status', ['open', 'testing', 'listing', 'closed'])->orderByDesc('id')->limit(20)->get()
            ->map(fn ($c) => ['id' => $c->id, 'name' => $c->name, 'program' => $c->program?->name, 'status' => $c->status, 'mode' => $c->rule['mode'] ?? 'merit',
                'seats' => $c->seats, 'apply_from' => $c->apply_from?->toDateString(), 'apply_until' => $c->apply_until?->toDateString(), 'test_date' => $c->test_date?->toDateString(),
                'application_fee' => $c->application_fee, 'accepting' => $c->accepting()]);
        return response()->json(['success' => true, 'data' => $rows->values()]);
    }
}
