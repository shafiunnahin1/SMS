<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.1: a boys' or girls' hostel; total_rooms follows its room count
class Hostel extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'name', 'type', 'total_rooms', 'warden_name', 'warden_phone'];
    protected $casts = ['total_rooms' => 'integer'];

    public function rooms() { return $this->hasMany(HostelRoom::class); }
}
