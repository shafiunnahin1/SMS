<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D165 (2) ST.3: a student's whole-class / class-subject / chapter purchase, valid until expires_at; a financial row, never deleted (D32)
class QbStudentScopeAccess extends Model
{
    use BelongsToInstitution;

    protected $table = 'qb_student_scope_access';

    const UPDATED_AT = null;

    protected $fillable = ['institution_id', 'student_user_id', 'scope', 'qb_class_level_id', 'qb_subject_id', 'qb_chapter_id', 'price', 'starts_at', 'expires_at',
        'qb_exam_batch_id', 'qb_student_order_id'];
    protected $casts = ['price' => 'decimal:2', 'starts_at' => 'datetime', 'expires_at' => 'datetime'];

    public function scopeActive($q) { return $q->where('expires_at', '>', now()); }
}
