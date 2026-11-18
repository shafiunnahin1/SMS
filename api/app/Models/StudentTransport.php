<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D229 TRN.1: a student on a route from started_on to ended_on (null = still riding); ended, never deleted
class StudentTransport extends Model
{
    use BelongsToInstitution;

    protected $table = 'student_transport';
    public $timestamps = false;
    protected $fillable = ['institution_id', 'student_id', 'route_id', 'stop_id', 'direction', 'started_on', 'ended_on'];
    protected $casts = ['started_on' => 'date:Y-m-d', 'ended_on' => 'date:Y-m-d'];

    public function student() { return $this->belongsTo(Student::class); }
    public function route() { return $this->belongsTo(TransportRoute::class, 'route_id'); }
    public function stop() { return $this->belongsTo(RouteStop::class, 'stop_id'); }
    public function scopeActive($q) { return $q->whereNull('ended_on'); }
}
