<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3; bKash to the platform merchant (D58 BkashService); items and amount computed by the server
class QbStudentOrder extends Model
{
    use BelongsToInstitution;

    protected $fillable = ['institution_id', 'student_user_id', 'ref', 'items', 'amount', 'payment_id', 'trx_id', 'status'];
    protected $casts = ['items' => 'array', 'amount' => 'decimal:2'];
}
