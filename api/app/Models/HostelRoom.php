<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.1: a room; current_occupancy = its active allocations (kept by HostelService)
class HostelRoom extends Model
{
    use BelongsToInstitution;

    public $timestamps = false;
    protected $fillable = ['institution_id', 'hostel_id', 'room_number', 'capacity', 'current_occupancy', 'floor', 'monthly_fee'];
    protected $casts = ['capacity' => 'integer', 'current_occupancy' => 'integer', 'floor' => 'integer', 'monthly_fee' => 'decimal:2'];

    public function hostel() { return $this->belongsTo(Hostel::class); }
    public function allocations() { return $this->hasMany(HostelAllocation::class, 'room_id'); }
}
