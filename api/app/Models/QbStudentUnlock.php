<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3
class QbStudentUnlock extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $fillable = ['institution_id', 'student_user_id', 'item_type', 'item_id', 'price', 'reason', 'qb_student_order_id', 'expires_at', 'qb_exam_batch_id'];
    protected $casts = ['price' => 'decimal:2', 'expires_at' => 'datetime'];

    /** D165 (3): still valid now (NULL = bought before validity existed - kept for good) */
    public function scopeActive($q) { return $q->where(fn ($w) => $w->whereNull('expires_at')->orWhere('expires_at', '>', now())); }
}
