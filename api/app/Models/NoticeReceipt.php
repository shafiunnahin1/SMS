<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D193 NTC.1: one reader of one notice - read when opened, acknowledged only by the explicit button
class NoticeReceipt extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'notice_id', 'user_id', 'read_at', 'acknowledged_at'];
    protected $casts = ['read_at' => 'datetime', 'acknowledged_at' => 'datetime'];
}
