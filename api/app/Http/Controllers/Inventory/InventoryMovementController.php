<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\InventoryMovementRequest;
use App\Http\Resources\InventoryMovementResource;
use App\Services\InventoryService;

class InventoryMovementController extends Controller
{
    public function __construct(private InventoryService $inventory) {}
    /** POST /inventory/{receive|issue|sale|return|adjust|damage} */
    public function store(InventoryMovementRequest $request, string $type)
    {
        abort_unless(array_key_exists($type, InventoryService::DIRECTIONS), 404);
        return (new InventoryMovementResource($this->inventory->move($type, $request->validated(), $request->user())))->response()->setStatusCode(201);
    }
}
