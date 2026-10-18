<?php
namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PrincipalActivationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return array_intersect_key($this->resource, array_flip(['institution_id', 'public_id', 'generation', 'status', 'delivery_pending']));
    }
}
