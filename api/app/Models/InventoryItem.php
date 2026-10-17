<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\{Model, SoftDeletes};

// R3.9: `stock` and `avg_cost` are a cache of the movement ledger; only InventoryService writes them (not fillable, D4).
class InventoryItem extends Model
{
    use BelongsToInstitution, HasFactory, SoftDeletes;

    public $timestamps = false;
    protected $fillable = ['code', 'name', 'category', 'unit', 'sale_price', 'reorder_level', 'is_sellable', 'is_active'];
    protected $casts = ['sale_price' => 'decimal:2', 'avg_cost' => 'decimal:2', 'reorder_level' => 'decimal:2', 'stock' => 'decimal:2',
        'is_sellable' => 'boolean', 'is_active' => 'boolean', 'deleted_at' => 'datetime'];

    public function movements() { return $this->hasMany(InventoryMovement::class, 'item_id'); }
}
