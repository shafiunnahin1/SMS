<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform-private, PlatformCatalogue with no tenant reads) - docs/modules/question-bank.md §3
class QbWriterWallet extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'none';   // never read from an institution's host: writers' money

    const CREATED_AT = null;

    protected $fillable = ['writer_user_id', 'balance', 'held'];
    protected $casts = ['balance' => 'decimal:2', 'held' => 'decimal:2'];
}
