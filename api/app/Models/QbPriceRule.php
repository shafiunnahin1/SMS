<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3; question-bank.md §4.3: every free / partly-free / discount method
class QbPriceRule extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    protected $fillable = ['target_type', 'target_ref', 'audience', 'method', 'value', 'priority', 'starts_at', 'ends_at', 'is_active', 'note', 'created_by'];
    protected $casts = ['value' => 'decimal:2', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'is_active' => 'boolean'];
}
