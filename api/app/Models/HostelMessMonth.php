<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.3: a closed mess month - never edited or deleted
class HostelMessMonth extends Model
{
    use BelongsToInstitution;

    protected $table = 'hostel_mess_months';
    protected $fillable = ['institution_id', 'hostel_id', 'month', 'mode', 'total_meals', 'total_bazar', 'meal_rate', 'closed_by', 'closed_at'];
    public $timestamps = false;
    protected $casts = ['total_meals' => 'decimal:2', 'total_bazar' => 'decimal:2', 'meal_rate' => 'decimal:4', 'closed_at' => 'datetime'];

    public function hostel() { return $this->belongsTo(Hostel::class); }
    public function bills() { return $this->hasMany(HostelMessBill::class, 'mess_month_id'); }
}
