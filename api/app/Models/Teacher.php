<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Teacher extends Model
{
    use BelongsToInstitution, SoftDeletes;

    public $timestamps = false;

    protected $fillable = [
        'institution_id',
        'user_id',
        'employee_id',
        'designation',
        'department',
        'joining_date',
        'qualification',
        'salary',
        'house_rent',
        'medical_allowance',
        'transport_allowance',
        'status',
        'leaving_date',
        'show_public',
        'public_bio',
        'mpo_index_no',
    ];

    protected $casts = [
        'joining_date' => 'date',
        'salary' => 'decimal:2',
        'house_rent' => 'decimal:2',
        'medical_allowance' => 'decimal:2',
        'transport_allowance' => 'decimal:2',
        'leaving_date' => 'date',
        'show_public' => 'boolean',
    ];

    public function user() { return $this->belongsTo(User::class); }
}
