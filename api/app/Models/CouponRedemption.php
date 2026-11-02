<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D187 (6): invoice_id NULL = the redemption itself (starts `discount_months` of discount); a row with an invoice = one discounted bill.
// Financial row: never updated or deleted (D32).
class CouponRedemption extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'coupon_id', 'payment_id', 'invoice_id', 'discount_amount', 'free_days'];
    protected $casts = ['discount_amount' => 'decimal:2', 'created_at' => 'datetime'];

    public function coupon() { return $this->belongsTo(Coupon::class); }
}
