<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D209 ACY.1: the lottery's commitment (sha256 of the seed, published when the cycle opens); the seed itself only after the draw (ACY.3)
class AdmissionDraw extends Model
{
    use BelongsToInstitution;

    public const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'cycle_id', 'seed_commitment', 'seed_reveal', 'applicants_count', 'result', 'drawn_by', 'drawn_at'];
    protected $casts = ['result' => 'array', 'drawn_at' => 'datetime', 'created_at' => 'datetime'];
}
