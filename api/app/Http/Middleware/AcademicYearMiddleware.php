<?php

namespace App\Http\Middleware;

use App\Models\AcademicYear;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

// `academic_year` - runs after `tenant`; binds app('currentYear') when the institution has a current year
// (coaching tenants may have none). docs/modules/academic-sessions.md
class AcademicYearMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $institution = app('currentInstitution');
        $year = Cache::remember("current_year:{$institution->id}", 3600,
            fn () => AcademicYear::where('is_current', true)->first());
        if ($year) app()->instance('currentYear', $year);
        return $next($request);
    }
}
