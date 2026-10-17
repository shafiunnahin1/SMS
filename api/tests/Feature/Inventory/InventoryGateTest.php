<?php

namespace Tests\Feature\Inventory;

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
}
