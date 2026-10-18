<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\User;
use Illuminate\Http\Request;

/** D91 selected-department + exact matched-route duty prerequisite, not complete resource authorization.
 * Callers still enforce resource/Teacher/payee ownership, module/feature, D33 and principal/maker-checker rules.
 * No route is opened here; identity-only endpoints do not call this business-context service.
 */
class DepartmentRequestContextService
{
    public function __construct(private DepartmentRoutePermissionResolver $routes, private DepartmentDutyPermissionService $permissions) {}

    public function forRoute(Request $request): int
    {
        $values = $request->headers->all('x-department-id');
        if (count($values) !== 1 || !is_string($values[0]) || !preg_match('/\A[0-9]+\z/', $values[0])) $this->forbidden();
        $value = ltrim($values[0], '0');
        $max = (string) PHP_INT_MAX;
        if ($value === '' || strlen($value) > strlen($max)
            || (strlen($value) === strlen($max) && strcmp($value, $max) > 0)) $this->forbidden();

        $actor = $request->user();
        $route = $this->routes->resolve($request);
        if (!$actor instanceof User || !$route || $route['source'] !== 'captured'
            || $route['resolved_mode'] !== 'exact_duty_permission' || !is_string($route['permission'])
            || !$this->permissions->has($actor, (int) $value, $route['permission'])) $this->forbidden();

        return (int) $value;
    }

    private function forbidden(): never
    {
        throw new BusinessException('Forbidden', 'forbidden', 403);
    }
}
