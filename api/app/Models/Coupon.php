<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// D187 (6): a platform coupon (AGENTS.md rule 8 exception list). Only `percent` is used now. Pausing stops new redemptions and
// never changes a discount already given.
class Coupon extends Model
{
    public const UPDATED_AT = null;
    protected $fillable = ['code', 'type', 'value', 'max_discount', 'applies_to_types', 'applies_to_modules', 'discount_months', 'valid_from', 'valid_until',
        'max_redemptions', 'per_institution_limit', 'status', 'note', 'created_by'];
    protected $casts = ['value' => 'decimal:2', 'max_discount' => 'decimal:2', 'applies_to_types' => 'array', 'applies_to_modules' => 'array',
        'valid_from' => 'date', 'valid_until' => 'date', 'max_redemptions' => 'integer', 'per_institution_limit' => 'integer',
        'redeemed_count' => 'integer', 'discount_months' => 'integer'];

    public function covers(string $module): bool
    {
        return empty($this->applies_to_modules) || in_array($module, $this->applies_to_modules, true);
    }
}
