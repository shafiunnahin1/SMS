<?php

namespace App\Services\Payments;

use App\Models\{Institution, InstitutionPaymentGateway};
use App\Support\Tenancy;

// D217 OPAY.1: which gateway, which mode. INSTITUTION MODE ONLY for now - the institution's own active gateway row; the
// platform-collect mode (and with it payout accounts and settlements) is not built until a later decision.
class PaymentRouter
{
    /** @return array{mode: 'institution', credentials: array, sandbox: bool, flow: string}|null */
    public function resolve(Institution $institution, string $gateway): ?array
    {
        if (!in_array($gateway, GatewayRegistry::enabledKeys(), true)) return null;
        $def = GatewayRegistry::definition($gateway);
        $own = Tenancy::as($institution, fn () => InstitutionPaymentGateway::where('gateway', $gateway)->where('status', 'active')->first());
        if (!$own) return null;
        return ['mode' => 'institution', 'credentials' => $own->credentials ?? [], 'sandbox' => (bool) $own->is_sandbox, 'flow' => $def['flow']];
    }

    /** for the parent screen: the buttons to show and the renderer each needs (empty = no Pay button) */
    public function options(Institution $institution): array
    {
        return collect(GatewayRegistry::enabledKeys())->map(function ($g) use ($institution) {
            $r = $this->resolve($institution, $g);
            return $r ? ['gateway' => $g, 'label' => GatewayRegistry::definition($g)['label'], 'mode' => $r['mode'], 'flow' => $r['flow']] : null;
        })->filter()->values()->all();
    }
}
