<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// D187 SUB.1: one price per module for everyone (D47), monthly and yearly. Platform table (AGENTS.md rule 8 exception, like
// SubscriptionPlan). Append-only: a price change is a new row; the current price is the latest row already in effect.
class ModulePrice extends Model
{
    public const UPDATED_AT = null;
    protected $fillable = ['module_key', 'monthly_price', 'yearly_price', 'effective_from', 'created_by'];
    protected $casts = ['monthly_price' => 'decimal:2', 'yearly_price' => 'decimal:2', 'effective_from' => 'datetime'];

    /** module_key => the row in effect now (missing = not priced yet, i.e. 0) */
    public static function current(): array
    {
        $out = [];
        foreach (static::where('effective_from', '<=', now())->orderBy('effective_from')->orderBy('id')->get() as $p) $out[$p->module_key] = $p;
        return $out;
    }
}
