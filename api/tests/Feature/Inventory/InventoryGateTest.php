<?php

namespace Tests\Feature\Inventory;

use App\Services\DepartmentRoutePermissionResolver;
use App\Support\DepartmentRouteCatalog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// D79/D47: the store follows the module gate (release -> override -> type -> opt-in); no subscription plan decides it.
class InventoryGateTest extends InventoryTestCase
{
    public function test_types_override_and_roles_gate_the_store(): void
    {
        foreach (['school', 'college', 'coaching'] as $type) {
            [$i, $admin] = $this->tenant('store-' . $type, $type);
            $this->api('GET', $this->hostOf($i), 'inventory/items', $admin)->assertOk();
        }
        [$batch, $tutor] = $this->tenant('store-batch', 'private_batch');
        $this->api('GET', $this->hostOf($batch), 'inventory/items', $tutor)->assertForbidden()->assertJsonPath('error', 'module_disabled');

        [$i, $admin] = $this->tenant('store-off');
        $i->update(['enabled_modules' => ['inventory' => false]]);
        $this->api('GET', $this->hostOf($i), 'inventory/stock', $admin)->assertForbidden()->assertJsonPath('error', 'module_disabled');

        [$i, $admin] = $this->tenant('store-roles');
        $this->api('GET', $this->hostOf($i), 'inventory/items', $this->makeUser($i, 'accountant'))->assertOk();
        foreach (['teacher', 'parent'] as $role) {
            $this->api('GET', $this->hostOf($i), 'inventory/items', $this->makeUser($i, $role))->assertForbidden();
        }
    }

    // D100: each store route is classified principal_only with no duty key, and the catalog row still matches the live route.
    public function test_d100_catalog_classifies_every_store_route_as_principal_only(): void
    {
        $resolver = app(DepartmentRoutePermissionResolver::class);
        $live = collect(Route::getRoutes()->getRoutes())->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/inventory'));
        $this->assertCount(9, DepartmentRouteCatalog::D100);
        $this->assertCount(9, $live);
        foreach (DepartmentRouteCatalog::D100 as $entry) {
            $method = explode('|', $entry['method'])[0];
            $route = $live->first(fn ($r) => $r->uri() === $entry['uri'] && in_array($method, $r->methods(), true));
            $this->assertNotNull($route, $entry['uri']);
            $this->assertSame($entry['action'], ltrim($route->getActionName(), '\\'));
            $gates = array_values(array_filter(app('router')->gatherRouteMiddleware($route), fn ($m) => str_starts_with($m, 'App\\Http\\Middleware\\ModuleMiddleware:')));
            $this->assertSame($entry['current_module_feature_gates'], $gates);
            $this->assertSame(['D100', 'principal_only', []], [$entry['approval'], $entry['staff_mode'], $entry['permission_options']]);

            $request = Request::create('/' . preg_replace('/\{[^}]+\}/', 'fixture', $entry['uri']), $method);
            $bound = clone $route; $bound->bind($request);
            $request->setRouteResolver(fn () => $bound);
            $resolved = $resolver->resolve($request);
            $this->assertSame(['d100', 'principal_only', null], [$resolved['source'], $resolved['resolved_mode'], $resolved['permission']], $entry['uri']);
        }
        $this->assertEmpty(array_intersect(array_column(DepartmentRouteCatalog::D100, 'uri'), array_column(DepartmentRouteCatalog::CAPTURED, 'uri')));
    }
}
