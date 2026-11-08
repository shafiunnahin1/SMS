<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D197 AAD.1: the admin / accountant lets one student through the dues block (admit card, result or both) until a date or for good
class DueBlockExemption extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    public const SCOPES = ['admit_card', 'result', 'all'];
    protected $fillable = ['institution_id', 'student_id', 'scope', 'reason', 'granted_by', 'expires_at'];
    protected $casts = ['expires_at' => 'date', 'created_at' => 'datetime'];
}
