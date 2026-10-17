<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DepartmentContextResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->resource['id'], 'code' => $this->resource['code'],
            'name' => $this->resource['name'], 'membership_id' => $this->resource['membership_id']];
    }
}
