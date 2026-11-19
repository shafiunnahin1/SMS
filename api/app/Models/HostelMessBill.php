<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.3: a frozen bill or an adjustment of a closed month
class HostelMessBill extends Model
{
    use BelongsToInstitution;

    protected $table = 'hostel_mess_bills';
    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'mess_month_id', 'student_id', 'kind', 'meals', 'amount', 'note', 'created_by'];
    protected $casts = ['meals' => 'decimal:2', 'amount' => 'decimal:2', 'created_at' => 'datetime'];

    public function month() { return $this->belongsTo(HostelMessMonth::class, 'mess_month_id'); }
    public function student() { return $this->belongsTo(Student::class); }
}
