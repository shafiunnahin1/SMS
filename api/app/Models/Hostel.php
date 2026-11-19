<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.1: a boys' or girls' hostel; total_rooms follows its room count
class Hostel extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'name', 'type', 'total_rooms', 'warden_name', 'warden_phone', 'mess_mode', 'mess_monthly_fee', 'breakfast_rate', 'lunch_rate', 'dinner_rate', 'breakfast_weight', 'lunch_weight', 'dinner_weight'];   // D233 HST.3: mess
    protected $casts = ['total_rooms' => 'integer', 'mess_monthly_fee' => 'decimal:2', 'breakfast_rate' => 'decimal:2', 'lunch_rate' => 'decimal:2', 'dinner_rate' => 'decimal:2', 'breakfast_weight' => 'decimal:2', 'lunch_weight' => 'decimal:2', 'dinner_weight' => 'decimal:2'];

    public function rooms() { return $this->hasMany(HostelRoom::class); }
}
