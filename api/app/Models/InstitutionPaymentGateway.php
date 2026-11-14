<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D217 OPAY.1: an institution's own gateway. The credentials are encrypted and never returned by any API.
class InstitutionPaymentGateway extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'gateway', 'credentials', 'credentials_hint', 'is_sandbox', 'status', 'last_checked_at', 'last_error', 'created_by'];

    protected $casts = ['credentials' => 'encrypted:array', 'is_sandbox' => 'boolean', 'last_checked_at' => 'datetime'];

    protected $hidden = ['credentials'];
}
