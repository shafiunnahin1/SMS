<?php

// D217 OPAY.1 (docs/modules/online-fee-payment.md "Configuration"): the gateway registry - everything about a gateway lives here.
// NO REAL PROVIDER YET: the owner has no merchant account, so bKash / SSLCommerz have no entry (no URL or field is invented) and
// ENABLED_GATEWAYS defaults to empty. The only entry is the dev/test `fakeqr`, and it does not exist in production.
$gateways = [];
if (env('APP_ENV', 'production') !== 'production') {
    $gateways['fakeqr'] = [
        'label' => ['bn' => 'পরীক্ষামূলক QR (আসল টাকা নয়)', 'en' => 'Test QR (no real money)'],
        'class' => \App\Services\Payments\Gateways\FakeQrGateway::class,
        'flow' => 'qr',
        'sandbox_toggle' => false,
        'credential_fields' => [],
    ];
}

return [
    'initiated_ttl_minutes'   => 30,    // an 'initiated' row older than this may be replaced by a new attempt
    'reconcile_after_minutes' => 10,    // redirect flow: the reconcile job asks the provider after this
    'expire_after_hours'      => 24,    // redirect flow: the reconcile job gives up and marks 'cancelled'
    'qr_late_grace_minutes'   => 30,    // qr flow: keep listening this long after expires_at before 'cancelled'
    'min_amount'              => '10.00',
    'central_url'             => env('APP_URL'),

    // which registry entries are offered to parents (comma list); empty until a real provider is added by a later decision
    'enabled' => array_values(array_filter(explode(',', (string) env('ENABLED_GATEWAYS', '')))),

    'gateways' => $gateways,
];
