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
}
