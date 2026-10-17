<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class SubscriptionInvoice extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'payment_id',
        'invoice_number',
        'plan_name',
        'billing_period',
        'amount',
        'tax',
        'total',
        'issued_at',
        'discount',
        'coupon_id',
        'tax_rate',
        'tax_label',
        'tax_inclusive',
        'credit_for_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'tax' => 'decimal:2',
        'total' => 'decimal:2',
        'issued_at' => 'datetime',
        'discount' => 'decimal:2',
        'tax_rate' => 'decimal:2',
        'tax_inclusive' => 'boolean',
    ];

    public function payment() { return $this->belongsTo(Payment::class); }
}
