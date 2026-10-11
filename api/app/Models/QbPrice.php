<?php

namespace App\Models;

use App\Traits\PlatformCatalogue;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (platform catalogue) - docs/modules/question-bank.md §3; a change is a NEW row (effective_from); old purchases keep their price
class QbPrice extends Model
{
    use PlatformCatalogue;

    public const TENANT_READ = 'all';   // read-only from an institution's host

    const UPDATED_AT = null;

    protected $fillable = ['audience', 'item_kind', 'qb_question_type_id', 'amount', 'effective_from', 'created_by'];
    protected $casts = ['amount' => 'decimal:2', 'effective_from' => 'datetime'];
}
