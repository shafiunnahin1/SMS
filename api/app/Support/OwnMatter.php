<?php

namespace App\Support;

use App\Models\{LeaveApplication, SalaryAdjustment, SalaryAdvance, SalaryRevision, StaffMember, Teacher, User};
use Illuminate\Http\Request;

// D206 TDM.3 (owner choice): a teacher in department mode never acts on their own matters - their own leave or its cover, their
// own pay rows (advances, adjustments, revisions, pay accounts, salary history), their own staff / teacher record or profile.
// Checked once per request, after the department-mode switch and before any controller or validation; 403 `own_matter`.
final class OwnMatter
{
    private const PAYEE_ROUTES = ['hr/advances/{id}' => SalaryAdvance::class, 'hr/advances/{id}/{action}' => SalaryAdvance::class,
        'hr/adjustments/{id}/approve' => SalaryAdjustment::class, 'hr/adjustments/{id}/cancel' => SalaryAdjustment::class,
        'hr/revisions/{id}' => SalaryRevision::class, 'hr/revisions/{id}/approve' => SalaryRevision::class, 'hr/revisions/{id}/cancel' => SalaryRevision::class,
        'hr/revisions/{id}/reject' => SalaryRevision::class, 'hr/revisions/{id}/letter.pdf' => SalaryRevision::class];

    public static function refused(Request $request, User $user): bool
    {
        $route = $request->route();
        if (!$route) return false;
        $uri = preg_replace('#^api/v1/#', '', $route->uri());
        $teacherIds = Teacher::withTrashed()->where('user_id', $user->id)->pluck('id')->map(fn ($v) => (int) $v)->all();
        $staffIds = StaffMember::withTrashed()->where('user_id', $user->id)->pluck('id')->map(fn ($v) => (int) $v)->all();
        $mine = fn (?string $type, $id) => $id !== null && (($type === 'teacher' && in_array((int) $id, $teacherIds, true)) || ($type === 'staff' && in_array((int) $id, $staffIds, true)));

        // their own profile / record
        if ($uri === 'staff/profile') return true;
        if (str_starts_with($uri, 'hr/staff/{id}') && in_array((int) $route->parameter('id'), $staffIds, true)) return true;
        // their own leave and its cover
        if ($route->parameter('leave') !== null && LeaveApplication::whereKey((int) $route->parameter('leave'))->where('user_id', $user->id)->exists()) return true;
        // their own pay: a person route, a payee in the request, or a pay row that names them
        if (str_starts_with($uri, 'hr/people/{type}/{id}') && $mine($route->parameter('type'), $route->parameter('id'))) return true;
        if ($mine($request->input('payee_type'), $request->input('payee_id'))) return true;
        if (isset(self::PAYEE_ROUTES[$uri]) && ($row = (self::PAYEE_ROUTES[$uri])::find((int) $route->parameter('id'))) && $mine($row->payee_type, $row->payee_id)) return true;
        return false;
    }
}
