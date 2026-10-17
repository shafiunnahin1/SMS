<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\User */
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'username' => $this->username,
            'role' => $this->role,
            'avatar' => $this->role === 'institution_staff' ? \App\Support\UserAvatar::url($this->resource) : $this->avatar,
            'locale' => $this->locale,
            'must_change_password' => (bool) $this->must_change_password,
            'two_factor_enabled' => (bool) $this->two_factor_enabled,
            'institution_id' => $this->institution_id,
        ];
    }
}
