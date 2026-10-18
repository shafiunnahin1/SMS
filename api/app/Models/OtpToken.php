<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OtpToken extends Model
{
    const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'otp',
        'expires_at',
        'used_at',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'used_at' => 'datetime',
    ];

    public function user() { return $this->belongsTo(User::class); }
}
