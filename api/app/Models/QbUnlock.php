<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3; one purchase per institution opens the answer AND paper use for all its teachers (D66)
class QbUnlock extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = ['institution_id', 'item_type', 'item_id', 'unlocked_by', 'price', 'reason', 'qb_price_rule_id', 'wallet_txn_ref'];
    protected $casts = ['price' => 'decimal:2'];
}
