<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D229 TRN.1: a stop on a route
class RouteStop extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'route_id', 'stop_name', 'pickup_time', 'drop_time', 'sequence'];
    protected $casts = ['sequence' => 'integer'];

    public function route() { return $this->belongsTo(TransportRoute::class, 'route_id'); }
}
