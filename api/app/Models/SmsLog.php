<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class SmsLog extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'to_phone',
        'message',
        'status',
        'segments',
        'encoding',
        'sender_id',
        'fallback_used',
        'error',
        'sent_at',
        'sent_by',
        'campaign_id',
        'gateway_msg_id',
        'delivery_status',
        'delivered_at',
    ];

    protected $casts = [
        'fallback_used' => 'boolean',
        'sent_at' => 'datetime',
        'delivered_at' => 'datetime',
    ];
}
