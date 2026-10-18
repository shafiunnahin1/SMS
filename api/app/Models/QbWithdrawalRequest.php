<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform-private, PlatformCatalogue with no tenant reads) - docs/modules/question-bank.md §3
class QbWithdrawalRequest extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'none';   // never read from an institution's host: writers' payout accounts and money

    public $timestamps = false;

    protected $fillable = ['writer_user_id', 'amount', 'payout_method', 'payout_account', 'status', 'requested_at', 'processed_by', 'processed_at', 'bank_transaction_id', 'note'];
    protected $casts = ['amount' => 'decimal:2', 'requested_at' => 'datetime', 'processed_at' => 'datetime', 'payout_account' => 'encrypted'];   // QB.10b: the account stored encrypted (schema note)
}
