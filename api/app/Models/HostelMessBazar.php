<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D233 HST.3: a bazar entry; a wrong one is reversed by a negative row
class HostelMessBazar extends Model
{
    use BelongsToInstitution;

    protected $table = 'hostel_mess_bazar';
    const UPDATED_AT = null;
    protected $fillable = ['institution_id', 'hostel_id', 'date', 'amount', 'note', 'reversal_of_id', 'expense_id', 'recorded_by'];
    protected $casts = ['date' => 'date:Y-m-d', 'amount' => 'decimal:2', 'created_at' => 'datetime'];
}
