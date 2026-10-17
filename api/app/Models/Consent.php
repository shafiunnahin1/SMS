<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

class Consent extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'student_id',
        'type',
        'status',
        'guardian_name',
        'guardian_phone',
        'method',
        'recorded_by',
        'granted_at',
        'revoked_at',
        'note',
    ];

    protected $casts = [
        'granted_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function student() { return $this->belongsTo(Student::class); }
}
