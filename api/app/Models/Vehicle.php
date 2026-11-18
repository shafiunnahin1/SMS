<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D229 TRN.1: a vehicle; the GPS columns stay unused (and never shown) until live location is decided
class Vehicle extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'name', 'number_plate', 'capacity', 'driver_name', 'driver_phone', 'helper_name', 'status'];
    protected $hidden = ['gps_device_id', 'gps_api_key'];
    protected $casts = ['capacity' => 'integer'];

    public function routes() { return $this->hasMany(TransportRoute::class); }
}
