<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D218 WAL.3: a student's own wallet (balance in taka). Changed only by StudentWalletService, always with a ledger row.
class UserWallet extends Model
{
    use BelongsToInstitution;

    const CREATED_AT = null;
    protected $fillable = ['institution_id', 'user_id', 'balance'];
    protected $casts = ['balance' => 'decimal:2'];
}
