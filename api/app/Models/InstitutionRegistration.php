<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class InstitutionRegistration extends Model
{
    use BelongsToInstitution, HasFactory;

    protected $fillable = ['institution_id', 'first_admin_id', 'source', 'review_status', 'reviewed_by', 'reviewed_at', 'rejection_reason'];
    protected $casts = ['reviewed_at' => 'datetime', 'created_at' => 'datetime', 'updated_at' => 'datetime'];
    protected $hidden = ['rejection_reason'];
}
