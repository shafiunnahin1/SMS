<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

// Decision D51: the web keeps its Sanctum token in the SERVER session (HttpOnly, host-only cookie) instead of in JavaScript.
// For a request from the SPA (Sanctum's stateful middleware started the session and checked CSRF) that carries no Authorization
// header, the session's token is used as the Bearer token - so every token rule (role lifetimes, idle timeout, max 5, revocation,
// the sessions list, force-logout) applies to the web unchanged. Mobile and API clients keep sending their own Bearer token.
class SessionBearer
{
    public const KEY = 'api_token';

    public function handle(Request $request, Closure $next)
    {
        if (!$request->bearerToken() && $request->hasSession() && ($token = $request->session()->get(self::KEY))) {
            $request->headers->set('Authorization', 'Bearer ' . $token);
        }
        return $next($request);
    }
}
