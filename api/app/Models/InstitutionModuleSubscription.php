<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D187 SUB.1: an institution's subscription to one paid module. `status` is refreshed daily (subscriptions:refresh); the gate
// always computes the effective state from the dates, so a missed run never gives or takes access.
class InstitutionModuleSubscription extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'module_key', 'status', 'billing_cycle', 'trial_ends_at', 'current_period_end', 'cancel_at_period_end'];
    protected $casts = ['trial_ends_at' => 'datetime', 'current_period_end' => 'datetime', 'cancel_at_period_end' => 'boolean'];
}
