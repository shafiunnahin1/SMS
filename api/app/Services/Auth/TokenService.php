<?php

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TokenService
{
    /** A Sanctum token with the role's absolute lifetime; keeps at most N tokens per user (the oldest go first) */
    public function issue(User $user, Request $request): string
    {
        [$abs] = config("auth_policy.tokens.{$user->role}");
        $new = $user->createToken('web', ['*'], now()->addMinutes($abs));
        $new->accessToken->forceFill([
            'device'  => Str::limit((string) $request->userAgent(), 120, ''),
            'ip_hash' => hash('sha256', $request->ip() . config('app.key')),
        ])->save();

        $ids = $user->tokens()->orderByDesc('id')->pluck('id');
        $user->tokens()->whereIn('id', $ids->slice(config('auth_policy.max_tokens_per_user')))->delete();
        return $new->plainTextToken;
    }

    public function revokeAll(User $user, ?int $exceptTokenId = null): void
    {
        $user->tokens()->when($exceptTokenId, fn ($q) => $q->where('id', '!=', $exceptTokenId))->delete();
    }
}
