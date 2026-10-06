<?php

namespace App\Models;

use App\Traits\BelongsToOptionalInstitution;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use BelongsToOptionalInstitution;

    const UPDATED_AT = null;

    protected $fillable = [
        'institution_id',
        'user_id',
        'action',
        'model',
        'model_id',
        'old_data',
        'new_data',
        'ip_address',
    ];

    protected $casts = [
        'old_data' => 'array',
        'new_data' => 'array',
    ];

    public function user() { return $this->belongsTo(User::class); }
}
