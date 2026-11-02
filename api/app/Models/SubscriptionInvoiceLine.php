<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D187: one module's charge on a subscription invoice (written by SUB.2). Financial row: never updated or deleted (D32).
class SubscriptionInvoiceLine extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'subscription_invoice_id', 'module_key', 'billing_cycle', 'period_start', 'period_end', 'days', 'unit_price', 'amount', 'discount'];
    protected $casts = ['period_start' => 'date', 'period_end' => 'date', 'unit_price' => 'decimal:2', 'amount' => 'decimal:2', 'discount' => 'decimal:2'];
}
