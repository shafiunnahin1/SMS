<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D229 TRN.1: a route; monthly_fee is the transport fee its students owe each month
class TransportRoute extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'name', 'vehicle_id', 'morning_departure', 'afternoon_departure', 'monthly_fee'];
    protected $casts = ['monthly_fee' => 'decimal:2'];

    public function vehicle() { return $this->belongsTo(Vehicle::class); }
    public function stops() { return $this->hasMany(RouteStop::class, 'route_id')->orderBy('sequence'); }
    public function assignments() { return $this->hasMany(StudentTransport::class, 'route_id'); }
}
