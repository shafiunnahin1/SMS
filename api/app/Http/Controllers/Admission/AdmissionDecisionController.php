<?php

namespace App\Http\Controllers\Admission;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Leads\LeadController;
use App\Models\{AdmissionCycle, AdmissionLead};
use App\Services\Admission\AdmissionDecisionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// D209 ACY.4 (docs/modules/admission-cycle.md section 5): POST /admission/leads/{id}/confirm | decline | admit and the result SMS
// POST /admission/cycles/{id}/result-sms (admin). Admit reuses the existing lead convert (same fields, same rules) and then marks
// the applicant admitted.
class AdmissionDecisionController extends Controller
{
    public function __construct(private AdmissionDecisionService $decisions) {}

    public function confirm(int $id)
    {
        $lead = $this->decisions->confirm(AdmissionLead::findOrFail($id));
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($lead->fresh())]);
    }

    public function decline(int $id)
    {
        $lead = AdmissionLead::findOrFail($id);
        $next = $this->decisions->decline($lead);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => $this->row($lead->fresh()) + ['promoted' => $next ? $this->row($next->fresh()) : null]]);
    }

    /** POST /admission/leads/{id}/admit - the lead convert's body (batch_ids and the student fields) */
    public function admit(Request $request, int $id)
    {
        $lead = AdmissionLead::with('cycle')->findOrFail($id);
        $this->decisions->assertAdmittable($lead);
        return DB::transaction(function () use ($request, $id) {
            $res = app()->call([app(LeadController::class), 'convert'], ['request' => $request, 'id' => $id]);
            $lead = AdmissionLead::lockForUpdate()->findOrFail($id);
            $this->decisions->markAdmitted($lead);
            $body = $res->getData(true);
            $body['data'] = array_merge($body['data'] ?? [], ['list_status' => 'admitted']);
            return response()->json($body, 201);
        });
    }

    public function resultSms(int $id)
    {
        $n = $this->decisions->sendResults(AdmissionCycle::findOrFail($id));
        return response()->json(['success' => true, 'data' => ['sent' => $n]]);
    }

    private function row(AdmissionLead $l): array
    {
        return ['id' => $l->id, 'application_no' => $l->application_no, 'merit_rank' => $l->merit_rank, 'list_status' => $l->list_status, 'confirm_by' => $l->follow_up_date?->toDateString()];
    }
}
