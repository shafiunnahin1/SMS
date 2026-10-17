<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InventoryItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'code' => $this->code, 'name' => $this->name, 'category' => $this->category, 'unit' => $this->unit,
            'sale_price' => $this->sale_price, 'avg_cost' => $this->avg_cost, 'reorder_level' => $this->reorder_level, 'stock' => $this->stock,
            'is_sellable' => $this->is_sellable, 'is_active' => $this->is_active, 'is_low' => \App\Support\Money::toPaisa($this->stock) <= \App\Support\Money::toPaisa($this->reorder_level),
            'deleted' => $this->deleted_at !== null];
    }
}
