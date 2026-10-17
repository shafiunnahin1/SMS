<?php

namespace App\Models;

use App\Exceptions\BusinessException;
use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

// R3.9: the ledger is the only truth; a movement is never changed or deleted - a mistake is corrected by an opposite movement (D32).
class InventoryMovement extends Model
{
    use BelongsToInstitution, HasFactory;

    public $timestamps = false;
    protected $fillable = ['item_id', 'type', 'qty', 'direction', 'unit_amount', 'total_amount', 'balance_after', 'student_id',
        'issued_to_type', 'issued_to_id', 'supplier', 'receipt_no', 'payment_method', 'reference', 'note', 'created_by'];
    protected $casts = ['qty' => 'decimal:2', 'direction' => 'integer', 'unit_amount' => 'decimal:2', 'total_amount' => 'decimal:2',
        'balance_after' => 'decimal:2', 'created_at' => 'datetime'];

    protected static function booted(): void
    {
        static::updating(fn () => throw new BusinessException(__('errors.inventory_immutable'), 'inventory_immutable', 409));
        static::deleting(fn () => throw new BusinessException(__('errors.inventory_immutable'), 'inventory_immutable', 409));
    }

    public function item() { return $this->belongsTo(InventoryItem::class, 'item_id')->withTrashed(); }
}
