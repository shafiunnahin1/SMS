<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;

// D206 TDM.2: a teacher in department mode. When a teacher selects a department (the X-Department-Id header, exactly as staff do)
// on a route that admits department staff, that ONE request treats them as `institution_staff`: the same exact duty keys, the same
// StaffIdentityBoundary lists, the same context and own-row rules, and none of their teacher rights. The role is changed in memory
// only - the User model never saves it (see User::booted). A fresh copy of the same user read inside the request gets the same
// treatment through asStaff().
final class DepartmentMode
{
    public const ATTRIBUTE = 'department_mode_user_id';

    /** the route admits department staff and the teacher chose a department */
    public static function applies(Request $request, ?User $user): bool
    {
        if (!$user || $user->role !== 'teacher' || !$request->headers->has('X-Department-Id') || !$request->route()) return false;
        foreach ($request->route()->gatherMiddleware() as $m) {
            if (is_string($m) && str_starts_with($m, 'role:') && in_array('institution_staff', explode(',', substr($m, 5)), true)) return true;
        }
        return false;
    }

    public static function enter(Request $request, User $user): void
    {
        $request->attributes->set(self::ATTRIBUTE, $user->id);
        self::asStaff($user);
    }

    /** a user object of the department-mode teacher (the signed-in one or a fresh copy) acts as staff for this request */
    public static function asStaff(?User $user): ?User
    {
        if ($user && app()->bound('request') && (int) request()->attributes->get(self::ATTRIBUTE) === (int) $user->id && $user->getOriginal('role') === 'teacher') {
            $user->setAttribute('role', 'institution_staff');
            $user->departmentMode = true;
        }
        return $user;
    }

    public static function active(?User $user): bool
    {
        return (bool) ($user?->departmentMode ?? false);
    }
}
