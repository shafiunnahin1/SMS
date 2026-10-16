<?php

namespace App\Services;

use App\Support\{DepartmentPermissionKeys, DepartmentRouteCatalog};
use Illuminate\Http\Request;
use Illuminate\Routing\Route;

/** Classification only. A descriptor never authorizes an actor or satisfies resource/module/D33 policy. */
class DepartmentRoutePermissionResolver
{
    public function resolve(Request $request): ?array
    {
        $route = $request->route();
        if (!$route instanceof Route) return null;
        foreach (DepartmentRouteCatalog::CAPTURED as $entry) {
            if ($route->uri() !== $entry['uri'] || !in_array($request->method(), explode('|', $entry['method']), true)) continue;
            // route:list omits a leading namespace separator that live fully-qualified routes may retain.
            if (ltrim($route->getActionName(), '\\') !== $entry['action']) return null;
            $mode = $entry['staff_mode'];
            $permission = null;
            if ($mode === 'exact_duty_permission') {
                if (count($entry['permission_options']) !== 1) return null;
                $permission = $entry['permission_options'][0];
            } elseif (in_array($mode, ['conditional_action', 'conditional_report_type'], true)) {
                foreach ($entry['selector_variants'] as $variant) {
                    // Path parameters only: body/query values cannot select or override a permission.
                    if ($route->parameter($variant['selector']) !== $variant['value']) continue;
                    $entry['resource_scope'] = $variant['resource_scope'];
                    $mode = $variant['principal_only'] ? 'principal_only' : 'exact_duty_permission';
                    $permission = $variant['principal_only'] ? null : $variant['permission'];
                    return $this->descriptor($entry, $mode, $permission);
                }
                return null;
            }
            return $this->descriptor($entry, $mode, $permission);
        }
        foreach (DepartmentRouteCatalog::FOUNDATION as $entry) {
            [$endpoint, $target] = explode(' -> ', $entry['route'], 2);
            [$method, $path] = explode(' ', $endpoint, 2);
            $matchesMethod = $request->method() === $method || ($method === 'GET' && $request->method() === 'HEAD');
            if (!$matchesMethod || $route->uri() !== 'api/v1'.$path) continue;
            if (class_basename($route->getActionName()) !== explode(' [', $target)[0]) return null;
            return ['source' => 'foundation', 'resolved_mode' => $entry['required_boundary'], 'permission' => null, 'contract' => $entry];
        }
        return null;
    }

    private function descriptor(array $entry, string $mode, ?string $permission): ?array
    {
        if ($permission !== null && !in_array($permission, DepartmentPermissionKeys::ALL, true)) return null;
        return ['source' => 'captured', 'resolved_mode' => $mode, 'permission' => $permission, 'contract' => $entry];
    }
}
