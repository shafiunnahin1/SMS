<?php

namespace Tests\Feature\I18n;

use App\Models\User;
use Illuminate\Testing\TestResponse;

// A request with its own headers (Accept-Language), as the SPA or a browser sends it
trait LocaleRequests
{
    private function req(string $method, string $host, string $path, ?User $as = null, array $headers = [], array $data = []): TestResponse
    {
        $this->app['auth']->forgetGuards();
        if ($as) $headers['Authorization'] = 'Bearer ' . $as->createToken('t')->plainTextToken;
        app()->setLocale('en');                                   // prove the request sets it, not a leftover
        return $this->json($method, "http://{$host}/api/v1/" . ltrim($path, '/'), $data, $headers);
    }
}
