<?php

namespace App\Http\Controllers\Admission;

use App\Http\Controllers\Controller;
use App\Models\{AdmissionCycle, AdmissionLead};
use App\Services\Admission\AdmissionListService;
use Illuminate\Http\Request;

// D209 ACY.3 (docs/modules/admission-cycle.md section 5): test marks, the merit list, the lottery (with the seed-loss fallback) and
// the draw record for the admin; the public transparency record for anyone (commitment and applicants' hash before the draw; the
// seed, the order and the lists after it - application numbers only, names only when the cycle publishes them).
class AdmissionListController extends Controller
{
    public function __construct(private AdmissionListService $lists) {}

    /** POST /admission/cycles/{id}/test-marks {rows: [{application_no, marks}]} */
    public function marks(Request $request, int $id)
    {
        $c = AdmissionCycle::findOrFail($id);
        $d = $request->validate(['rows' => 'required|array|min:1|max:5000', 'rows.*.application_no' => 'required|string|max:20|distinct',
            'rows.*.marks' => 'present|nullable|numeric|min:0|max:9999|decimal:0,2']);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['saved' => $this->lists->saveMarks($c, $d['rows'])]]);
    }

    public function merit(Request $request, int $id)
    {
        $this->lists->merit(AdmissionCycle::findOrFail($id), $request->user()->id);
        return $this->draw($id);
    }

    /** POST /admission/cycles/{id}/list/lottery {seed} */
    public function lottery(Request $request, int $id)
    {
        $c = AdmissionCycle::findOrFail($id);
        $d = $request->validate(['seed' => 'required|string|max:100']);
        $this->lists->lottery($c, $d['seed'], $request->user()->id);
        return $this->draw($id);
    }

    /** POST /admission/cycles/{id}/draw/recommit - the seed was lost; the new seed is in this response only */
    public function recommit(int $id)
    {
        $seed = $this->lists->recommit(AdmissionCycle::findOrFail($id));
        return response()->json(['success' => true, 'data' => $this->record(AdmissionCycle::with('draw')->findOrFail($id), true) + ['seed' => $seed]]);
    }

    /** GET /admission/cycles/{id}/draw */
    public function draw(int $id)
    {
        return response()->json(['success' => true, 'data' => $this->record(AdmissionCycle::with('draw')->findOrFail($id), true)]);
    }

    /** GET /public/admission/cycle/{id}/transparency (no login) */
    public function transparency(int $id)
    {
        $c = AdmissionCycle::with('draw')->whereIn('status', ['open', 'testing', 'listing', 'closed'])->findOrFail($id);
        return response()->json(['success' => true, 'data' => $this->record($c, false)]);
    }

    private function record(AdmissionCycle $c, bool $admin): array
    {
        $draw = $c->draw;
        $listed = in_array($c->status, ['listing', 'closed'], true);
        $names = $admin || !empty($c->rule['publish_names']);
        $rows = $listed ? AdmissionLead::where('cycle_id', $c->id)->whereNotNull('merit_rank')->orderBy('merit_rank')->get()
            ->map(fn ($l) => array_filter(['rank' => $l->merit_rank, 'application_no' => $l->application_no, 'list_status' => $l->list_status,
                'marks' => ($c->rule['mode'] ?? 'merit') === 'merit' ? $l->test_marks : null, 'name' => $names ? $l->name : null], fn ($v) => $v !== null))->values() : [];
        return ['cycle' => ['id' => $c->id, 'name' => $c->name, 'status' => $c->status, 'mode' => $c->rule['mode'] ?? 'merit', 'seats' => $c->seats, 'waiting' => $c->rule['waiting'] ?? 0],
            'draw' => $draw ? array_filter([
                'seed_commitment' => $draw->seed_commitment, 'applicants_count' => $draw->applicants_count, 'applicants_hash' => $draw->result['applicants_hash'] ?? null,
                'guarantee' => $draw->result['guarantee'] ?? 'strong', 'seed' => $draw->seed_reveal, 'algorithm' => $draw->seed_reveal ? AdmissionListService::ALGORITHM : null,
                'order' => $draw->seed_reveal ? ($draw->result['order'] ?? []) : null, 'drawn_at' => $draw->drawn_at?->toIso8601String(),
            ], fn ($v) => $v !== null) : null,
            // after the freeze anyone can recompute the applicants' hash from these numbers (no names)
            'applicants' => $draw && $c->status !== 'open' ? AdmissionLead::where('cycle_id', $c->id)->whereNotNull('test_roll')->pluck('application_no')->sort(SORT_STRING)->values() : [],
            'list' => $rows];
    }
}
