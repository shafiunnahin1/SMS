<?php

namespace App\Services\Payments;

// D217 OPAY.1: reads config/payments.php. `fakeqr` exists only outside production (dev sandbox + tests).
class GatewayRegistry
{
    /** keys that may be offered to parents */
    public static function enabledKeys(): array
    {
        $keys = config('payments.enabled', []);
        if (!app()->environment('production') && config('payments.gateways.fakeqr')) $keys[] = 'fakeqr';
        if (app()->environment('production')) $keys = array_diff($keys, ['fakeqr']);
        return array_values(array_intersect(array_unique($keys), array_keys(config('payments.gateways', []))));
    }

    public static function definition(string $key): ?array
    {
        return config("payments.gateways.{$key}");
    }

    public static function make(string $key): GatewayInterface
    {
        return app(self::definition($key)['class']);
    }
}
