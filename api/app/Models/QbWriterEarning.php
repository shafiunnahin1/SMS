<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform-private, PlatformCatalogue with no tenant reads) - docs/modules/question-bank.md §3; D66: a share of every sale, written in the sale's transaction; never deleted (D32)
class QbWriterEarning extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'none';   // never read from an institution's host: writers' money (D32/D33-like: platform-private)

    const UPDATED_AT = null;

    protected $fillable = ['writer_user_id', 'source', 'source_id', 'item_type', 'item_id', 'sale_amount', 'share_percent', 'amount'];
    protected $casts = ['sale_amount' => 'decimal:2', 'share_percent' => 'decimal:2', 'amount' => 'decimal:2'];
}
