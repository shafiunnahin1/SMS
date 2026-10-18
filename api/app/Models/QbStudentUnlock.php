<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3
class QbStudentUnlock extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = ['institution_id', 'student_user_id', 'item_type', 'item_id', 'price', 'reason', 'qb_student_order_id'];
    protected $casts = ['price' => 'decimal:2'];
}
