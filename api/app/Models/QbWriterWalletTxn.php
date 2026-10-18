<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform-private, PlatformCatalogue with no tenant reads) - docs/modules/question-bank.md §3
class QbWriterWalletTxn extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'none';   // never read from an institution's host: writers' money

    const UPDATED_AT = null;

    protected $fillable = ['writer_user_id', 'type', 'amount', 'balance_after', 'reference', 'created_by'];
    protected $casts = ['amount' => 'decimal:2', 'balance_after' => 'decimal:2'];
}
