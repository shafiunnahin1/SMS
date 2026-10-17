<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin \App\Models\Institution */
class TerminologyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $defaults  = config("institution_types.{$this->institution_type}.terms", []);
        $overrides = $this->terminology ?? [];
        $effective = [];
        foreach ($defaults as $key => $byLocale) {
            $effective[$key] = array_merge($byLocale, $overrides[$key] ?? []);
        }

        return ['defaults' => $defaults, 'overrides' => (object) $overrides, 'effective' => $effective];
    }
}
