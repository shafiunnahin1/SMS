<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/** D90/R3.6a: ship the new login identity without granting legacy business access.
 * R3.6b must add reviewed capability/resource enforcement before opening business routes.
 */
class StaffIdentityBoundary
{
    private const OWN_IDENTITY = [
        'PATCH api/v1/auth/change-password', 'GET api/v1/auth/sessions', 'DELETE api/v1/auth/sessions/{id}',
        'POST api/v1/auth/logout-all', 'PUT api/v1/auth/locale', 'GET api/v1/notifications',
        'PATCH api/v1/notifications/read-all', 'PATCH api/v1/notifications/{id}/read', 'PATCH api/v1/staff/profile',
        'GET api/v1/staff/departments', 'HEAD api/v1/staff/departments',
        'GET api/v1/staff/departments/{id}/portal', 'HEAD api/v1/staff/departments/{id}/portal',
        'GET api/v1/teachers', 'HEAD api/v1/teachers',
    ];
    public function handle(Request $request, Closure $next)
    {
        // Only reviewed method/URI/action combinations reach their D91 + own-resource checks.
        $ownBatches = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/teacher/batches'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\BatchController::class.'@mine';
        $ownPrograms = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/programs'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\ProgramController::class.'@index';
        $batchList = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/batches'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\BatchController::class.'@index';
        $batchShow = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/batches/{id}'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\BatchController::class.'@show';
        $programShow = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/programs/{id}'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\ProgramController::class.'@show';
        $subjectList = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/subjects'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\SubjectController::class.'@index';
        $subjectShow = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/subjects/{id}'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Academic\SubjectController::class.'@show';
            $ownTeacherAdvances = in_array($request->method(), ['GET', 'HEAD'], true)
                && $request->route()->uri() === 'api/v1/teacher/salary/advances';
        $ownTeacherDashboard = in_array($request->method(), ['GET', 'HEAD'], true)
            && $request->route()->uri() === 'api/v1/teacher/dashboard'
            && ltrim($request->route()->getActionName(), '\\') === \App\Http\Controllers\Shared\DashboardController::class.'@teacher';
        if ($request->user()?->role === 'institution_staff'
            && !in_array($request->method().' '.$request->route()->uri(), self::OWN_IDENTITY, true) && !$ownBatches && !$ownPrograms && !$batchList && !$batchShow && !$programShow && !$subjectList && !$subjectShow && !$ownTeacherAdvances && !$ownTeacherDashboard) {
            return response()->json(['success' => false, 'error' => 'forbidden', 'message' => __('errors.forbidden')], 403);
        }
        return $next($request);
    }
}
