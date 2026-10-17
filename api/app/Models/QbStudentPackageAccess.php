<?php

namespace App\Models;

use App\Traits\BelongsToInstitution;
use Illuminate\Database\Eloquent\Model;

// D65/D66 question bank (institution data) - docs/modules/question-bank.md §3
class QbStudentPackageAccess extends Model
{
    use BelongsToInstitution;

    const UPDATED_AT = null;

    protected $table = 'qb_student_package_access';
    protected $fillable = ['institution_id', 'student_user_id', 'qb_quiz_package_id', 'starts_at', 'expires_at', 'qb_student_order_id'];
    protected $casts = ['starts_at' => 'datetime', 'expires_at' => 'datetime'];
}
