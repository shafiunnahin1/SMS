<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \Laravel\Sanctum\PersonalAccessToken - never the IP (only its hash is stored) */
class SessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'device' => $this->device,
            'created_at' => $this->created_at,
            'last_used_at' => $this->last_used_at,
            'expires_at' => $this->expires_at,
            'is_current' => $request->user()?->currentAccessToken()?->id === $this->id,
        ];
    }
}
