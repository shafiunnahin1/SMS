<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = [
        'institution_id',
        'amount',
        'method',
        'trx_id',
        'status',
        'paid_at',
        'invoice_no',
        'refunded_amount',
        'refund_note',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'paid_at' => 'datetime',
        'refunded_amount' => 'decimal:2',
    ];
}
