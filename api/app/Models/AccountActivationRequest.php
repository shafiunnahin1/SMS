<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AccountActivationRequest extends Model
{
    use BelongsToInstitution, HasFactory;

    protected $fillable = ['institution_id', 'user_id', 'public_id', 'purpose', 'generation', 'channel', 'contact_hash', 'otp_token_id', 'authorized_by', 'status', 'expires_at', 'contact_verified_at', 'consumed_at'];
    protected $casts = ['generation' => 'integer', 'expires_at' => 'datetime', 'contact_verified_at' => 'datetime', 'consumed_at' => 'datetime', 'created_at' => 'datetime', 'updated_at' => 'datetime'];
    protected $hidden = ['contact_hash', 'otp_token_id'];
}
