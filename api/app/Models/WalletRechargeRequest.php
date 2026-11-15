<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D218 WAL.1: a manual wallet top-up - money sent outside the system, a receipt attached, a Super Admin decides.
// user_id NULL = the institution's wallet; set = that student's wallet (D218 (5), from WAL.3). A money record: never deleted (D32).
class WalletRechargeRequest extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;
    public const METHODS = ['bkash', 'nagad', 'rocket', 'upay', 'bank', 'other'];

    protected $fillable = ['institution_id', 'user_id', 'amount', 'method', 'trx_reference', 'receipt_path', 'note', 'status', 'requested_by', 'decided_by', 'decided_at', 'decision_note'];

    protected $casts = ['amount' => 'decimal:2', 'decided_at' => 'datetime', 'created_at' => 'datetime'];

    protected $hidden = ['receipt_path'];

    /** D218 (5): the student whose wallet this request tops up (null = the institution's wallet) */
    public function user(): \Illuminate\Database\Eloquent\Relations\BelongsTo { return $this->belongsTo(User::class); }
}
