<?php

namespace App\Http\Controllers\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\InventoryItemRequest;
use App\Http\Resources\{InventoryItemResource, InventoryMovementResource};
use App\Models\InventoryItem;
use App\Services\InventoryService;
use Illuminate\Http\Request;

// R3.9 store items; stock itself is never edited here, only through POST /inventory/{type}.
class InventoryItemController extends Controller
{
    public function __construct(private InventoryService $inventory) {}
    public function index(Request $request)
    {
        $items = InventoryItem::when($request->query('q'), fn ($q, $v) => $q->where(fn ($w) => $w->where('code', 'like', "%{$v}%")->orWhere('name', 'like', "%{$v}%")))
            ->orderBy('code')->paginate(min((int) $request->query('per_page', 25), 100));
        return InventoryItemResource::collection($items);
    }
    public function store(InventoryItemRequest $request) { return (new InventoryItemResource($this->inventory->createItem($request->validated())))->response()->setStatusCode(201); }
    public function update(InventoryItemRequest $request, int $id) { return new InventoryItemResource($this->inventory->updateItem($id, $request->validated())); }
    public function destroy(int $id) { return new InventoryItemResource($this->inventory->removeItem($id)); }
    public function ledger(int $id) { return InventoryMovementResource::collection($this->inventory->ledger($id)); }
}
