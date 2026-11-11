<?php

namespace App\Http\Controllers\Hr;

use App\Http\Controllers\Controller;
use App\Services\Substitution\SlotActionService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// D200 SUBL.4 (docs/API.md D96 slot actions): seven mutations on one cover slot of one leave. Every one needs an Idempotency-Key
// header and `expected_versions` {slot, source}; ids and versions are decimal STRINGS; an unknown field is refused (no tenant,
// actor, date, time or status can be sent). The answer is the D99 result manifest - never the slot or leave itself.
class LeaveSubstitutionController extends Controller
{
    private const FIELDS = ['nominate' => ['substitute_teacher_id'], 'clear_nomination' => [], 'offer' => ['substitute_teacher_id', 'reason'], 'clear_offer' => ['reason'],
        'accept' => [], 'decline' => ['reason'], 'refresh_source' => ['reason']];

    public function act(Request $request, int $leave, int $slot, SlotActionService $slots)
    {
        $action = $request->route()->defaults['action'];
        // another institution's (or a mismatched) leave / slot is 404 before anything else is looked at
        \App\Models\LeaveSubstitutionSlot::where('leave_application_id', \App\Models\LeaveApplication::findOrFail($leave)->id)->findOrFail($slot);
        $allowed = array_merge(['expected_versions'], self::FIELDS[$action]);
        if (array_diff(array_keys($request->all()), $allowed)) throw ValidationException::withMessages(['fields' => __('hr.invalid')]);
        $target = in_array('substitute_teacher_id', $allowed, true);
        $data = $request->validate([
            'expected_versions' => 'required|array:slot,source',
            'expected_versions.slot' => ['required', 'string', 'regex:/^[1-9][0-9]*$/'],
            'expected_versions.source' => ['required', 'string', 'regex:/^[0-9a-f]{64}$/'],
            'substitute_teacher_id' => [$target ? 'required' : 'prohibited', 'string', 'regex:/^[1-9][0-9]*$/'],
            'reason' => [$action === 'refresh_source' ? 'required' : 'nullable', 'string', 'max:255'],
        ]);
        return response()->json(['success' => true, 'data' => $slots->act($action, $leave, $slot, $data, $request->user(), $request->header('Idempotency-Key'))]);
    }

    // ── D200 SUBL.5: the reads (docs/API.md D199). No Idempotency-Key, nothing is written. ──

    /** GET /hr/leaves/{leave}/substitution-slots - the admin; the applicant only for their own leave (another teacher's leave is 404) */
    public function index(Request $request, int $leave, \App\Services\Substitution\SlotReadService $reads)
    {
        return response()->json(['success' => true, 'data' => $reads->forLeave($this->visibleLeave($request, $leave))]);
    }

    /** GET /hr/substitution-slots?from=&to=&status=&page= - the admin: future slots of approved leaves, at most 31 days */
    public function needing(Request $request, \App\Services\Substitution\SlotReadService $reads)
    {
        $d = $request->validate(['from' => 'nullable|date_format:Y-m-d', 'to' => 'nullable|date_format:Y-m-d|after_or_equal:from', 'status' => 'nullable|in:unassigned,offered', 'page' => 'nullable|integer|min:1']);
        $from = $d['from'] ?? now()->toDateString();
        $to = $d['to'] ?? \Carbon\Carbon::parse($from)->addDays(7)->toDateString();
        if (\Carbon\Carbon::parse($from)->diffInDays(\Carbon\Carbon::parse($to)) > 31) throw ValidationException::withMessages(['to' => __('hr.invalid')]);
        return response()->json(['success' => true, 'data' => $reads->needing($from, $to, $d['status'] ?? 'unassigned', (int) ($d['page'] ?? 1)) + ['from' => $from, 'to' => $to]]);
    }

    /** GET /hr/leaves/{leave}/substitution-slots/{slot}/candidates - the admin (pending or approved leave), the applicant (own pending leave) */
    public function candidates(Request $request, int $leave, int $slot, \App\Services\Substitution\SlotReadService $reads)
    {
        $row = $this->visibleLeave($request, $leave);
        $s = \App\Models\LeaveSubstitutionSlot::where('leave_application_id', $row->id)->findOrFail($slot);
        $ok = $request->user()->role === 'admin' ? in_array($row->status, ['pending', 'approved'], true) : $row->status === 'pending';
        abort_unless($ok && $s->status !== 'cancelled', 403);
        return response()->json(['success' => true, 'data' => $reads->candidates($row, $s)]);
    }

    private function visibleLeave(Request $request, int $leave): \App\Models\LeaveApplication
    {
        $row = \App\Models\LeaveApplication::findOrFail($leave);
        if ($request->user()->role !== 'admin' && (int) $row->user_id !== (int) $request->user()->id) abort(404);
        return $row;
    }
}
