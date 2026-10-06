<?php

namespace App\Http\Controllers\Public;

use Illuminate\Support\Facades\{Cache, DB};

// docs/templates/laravel-core-files.md "HealthController": unauthenticated, 503 when DB or Redis is down (UptimeRobot, CI)
class HealthController
{
    public function __invoke()
    {
        $ok = fn (callable $f) => rescue(fn () => (bool) $f(), false, false) ? 'ok' : 'error';
        $checks = [
            'db'    => $ok(fn () => DB::connection()->getPdo()),
            'redis' => $ok(fn () => Cache::store('redis')->put('health:ping', 'pong', 5)),
        ];
        $healthy = !in_array('error', $checks, true);
        return response()->json(['status' => $healthy ? 'ok' : 'degraded', ...$checks, 'time' => now()->toISOString()], $healthy ? 200 : 503);
    }
}
