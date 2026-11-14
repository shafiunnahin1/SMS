<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D218 WAL.3: one move of a student's wallet - append-only (D32); amount signed (+ in, - out), balance_after the new balance
class UserWalletTransaction extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'user_id', 'type', 'amount', 'balance_after', 'reference', 'created_by'];
    protected $casts = ['amount' => 'decimal:2', 'balance_after' => 'decimal:2', 'created_at' => 'datetime'];
}
