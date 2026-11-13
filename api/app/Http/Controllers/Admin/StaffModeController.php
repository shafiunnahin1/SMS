<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\{AuditLog, Institution, StaffMappingReview, User};
use App\Services\{LegacyStaffMappingDryRunService, StaffDepartmentModeService};
use Illuminate\Http\Request;

// D207 MODE.1: the D101 staff department mode switch on screen. Built only on the existing services (D101 rules unchanged):
// the dry-run report with each account's review state, one append-only review per account, and the switch itself (to
// `department` only when D101 allows it; back to `legacy` ends those accounts' sessions, as D101 says). Admin only; audited.
class StaffModeController extends Controller
{
    public function __construct(private StaffDepartmentModeService $mode, private LegacyStaffMappingDryRunService $dryRun) {}

    /** GET /admin/staff-mode */
    public function show()
    {
        $i = Institution::find(app('currentInstitution')->id);
        $report = $this->dryRun->report();
        $ids = collect($report['users'])->pluck('user_id');
        $names = User::inTenant()->whereIn('id', $ids)->pluck('name', 'id');
        $latest = StaffMappingReview::whereIn('id', StaffMappingReview::selectRaw('MAX(id)')->whereIn('user_id', $ids)->groupBy('user_id'))->get()->keyBy('user_id');
        $users = collect($report['users'])->map(fn ($r) => $r + ['name' => $names[$r['user_id']] ?? null,
            'review' => ($rv = $latest[$r['user_id']] ?? null) ? ['decision' => $rv->decision, 'teacher_id' => $rv->teacher_id, 'staff_member_id' => $rv->staff_member_id,
                'note' => $rv->note, 'reviewed_at' => $rv->reviewed_at?->toIso8601String()] : null])->values();
        return response()->json(['success' => true, 'data' => [
            'mode' => $i->staff_department_mode ?: 'legacy', 'switched_at' => $i->switched_at?->toIso8601String(),
            'switched_by' => $i->switched_by ? User::inTenant()->whereKey($i->switched_by)->value('name') : null,
            'users' => $users, 'profiles_without_valid_login' => $report['profiles_without_valid_login'],
            'summary' => ['users' => count($users), 'reviewed' => $users->whereNotNull('review')->count(),
                'unresolved_identity_collisions' => $report['summary']['unresolved_identity_collisions']],
        ]]);
    }

    /** POST /admin/staff-mode/reviews { user_id, teacher_id?, staff_member_id?, decision, note? } */
    public function review(Request $request)
    {
        $v = $request->validate(['user_id' => 'required|integer|min:1', 'teacher_id' => 'nullable|integer|min:1', 'staff_member_id' => 'nullable|integer|min:1',
            'decision' => 'required|string|max:40', 'note' => 'nullable|string|max:255']);
        $user = User::inTenant()->whereIn('role', LegacyStaffMappingDryRunService::LEGACY_ROLES)->findOrFail($v['user_id']);
        $row = $this->mode->recordReview($request->user(), $user, $v['teacher_id'] ?? null, $v['staff_member_id'] ?? null, $v['decision'], $v['note'] ?? null);
        AuditLog::record('staff_mode.reviewed', $user, ['review_id' => $row->id, 'decision' => $row->decision]);
        return response()->json(['success' => true, 'message' => __('messages.saved'), 'data' => ['id' => $row->id]], 201);
    }

    /** PUT /admin/staff-mode { mode: legacy|department } */
    public function update(Request $request)
    {
        $v = $request->validate(['mode' => 'required|in:legacy,department']);
        $from = app('currentInstitution')->staff_department_mode ?: 'legacy';
        $i = $this->mode->switchMode($request->user(), $v['mode']);
        if ($from !== $i->staff_department_mode) AuditLog::record('staff_mode.switched', $i, ['from' => $from, 'to' => $i->staff_department_mode]);
        return $this->show();
    }
}
